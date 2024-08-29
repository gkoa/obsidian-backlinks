import { App, MarkdownView, Modal, Notice, Plugin, TFile, TAbstractFile } from 'obsidian';

export default class BacklinksPlugin extends Plugin {

	async onload() {
		this.addCommand({
			id: 'open-float-menu-backlinks',
			name: 'Open float menu backlinks',
			callback: () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					new BacklinksModal(this.app, activeFile).open();
				} else {
					new Notice('No active file found!');
				}
			}
		});
	}

	onunload() {
		// Код для очистки ресурсов, если необходимо
	}
}

class BacklinksModal extends Modal {
	file: TFile;
	backlinks: { file: TFile, header?: string }[] = [];

	constructor(app: App, file: TFile) {
		super(app);
		this.file = file;
		this.backlinks = this.getBacklinks();
	}

	onOpen() {
		const { contentEl } = this;

		if (this.backlinks.length === 0) {
			contentEl.setText('No backlinks found!');
			return;
		}

		const listEl = contentEl.createEl('ul');
		listEl.addClass('backlinks-list');

		this.backlinks.forEach((backlink, index) => {
			const listItemEl = listEl.createEl('li');
			listItemEl.addClass('backlink-item');

			const linkText = backlink.header ? `${backlink.file.basename} -> ${backlink.header}` : backlink.file.basename;
			listItemEl.setText(linkText);
			listItemEl.tabIndex = 0;

			listItemEl.addEventListener('focus', () => {
				listItemEl.addClass('is-focused');
			});

			listItemEl.addEventListener('blur', () => {
				listItemEl.removeClass('is-focused');
			});

			listItemEl.onkeydown = async (evt: KeyboardEvent) => {
				if (evt.key === 'Enter') {
					await this.navigateToBacklink(backlink);
					this.close();
				} else if (evt.key === 'ArrowDown') {
					(listItemEl.nextElementSibling as HTMLElement)?.focus();
				} else if (evt.key === 'ArrowUp') {
					(listItemEl.previousElementSibling as HTMLElement)?.focus();
				}
			};

			listItemEl.onclick = async () => {
				await this.navigateToBacklink(backlink);
				this.close();
			};
		});

		(listEl.firstChild as HTMLElement)?.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	getBacklinks(): { file: TFile, header?: string }[] {
		if (!this.file) {
			new Notice('Current file is not defined.');
			return [];
		}
	
		const backlinks: { file: TFile, header?: string }[] = [];
	
		this.app.vault.getMarkdownFiles().forEach(file => {
			// Проверка ссылок в содержимом файла
			const links = this.app.metadataCache.getFileCache(file)?.links;
			if (links) {
				links.forEach(link => {
					if (link.link.includes(this.file.basename)) {
						const headerMatch = link.link.match(/#([^\]]+)/);
						backlinks.push({
							file: file,
							header: headerMatch ? headerMatch[1] : undefined
						});
					}
				});
			}
	
			// Проверка метаданных YAML фронтматтера
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (frontmatter && frontmatter.parent) {
				const parentLinks = Array.isArray(frontmatter.parent) ? frontmatter.parent : [frontmatter.parent];
				parentLinks.forEach(parentLink => {
					if (parentLink.includes(this.file.basename)) {
						backlinks.push({
							file: file,
							header: undefined // Для метаданных нет заголовков, устанавливаем undefined
						});
					}
				});
			}
		});
	
		return backlinks;
	}

	async navigateToBacklink(backlink: { file: TFile, header?: string }) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			await view.leaf.openFile(backlink.file, { active: true });
			if (backlink.header) {
				await this.moveToHeader(backlink.file, backlink.header);
			}
		} else {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(backlink.file, { active: true });
			if (backlink.header) {
				await this.moveToHeader(backlink.file, backlink.header);
			}
		}
	}

async moveToHeader(file: TFile, header: string) {
    const doc = await this.app.vault.read(file);
    const lines = doc.split('\n');
    let headerPosition = -1;

    // Регулярное выражение для поиска строки вида "#text]]"
    const headerRegex = new RegExp(`#${header}\\]\\]`, 'i');
	
    // Найти строку с заголовком, который содержит ссылку
    for (let i = 0; i < lines.length; i++) {
        if (headerRegex.test(lines[i])) {
			headerPosition = i;
			break;
        }
    }

    if (headerPosition !== undefined) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const editor = view.editor;
            const viewportHeight = view.containerEl.clientHeight; // Высота видимой области редактора
            const numberOfVisibleLines = Math.floor(viewportHeight / 20); // Приблизительная высота строки

            // Установить курсор на строку с заголовком
            editor.setCursor({ line: headerPosition, ch: 0 });

            // Прокрутить страницу так, чтобы строка с курсором оказалась в середине видимой части
            const middleLine = Math.floor(numberOfVisibleLines / 2);
            const scrollLine = Math.max(0, headerPosition - middleLine);
            editor.scrollIntoView({ from: { line: scrollLine, ch: 0 }, to: { line: scrollLine + numberOfVisibleLines, ch: 0 } });
        }
    } else {
        new Notice(`Header "${header}" not found in file "${file.basename}"`);
    }
}
}
