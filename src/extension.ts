// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getLanguageService, TextDocument } from 'vscode-html-languageservice';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
// document.getText(document.getWordRangeAtPosition(new vscode.Position(position.line, document.lineAt(position).text.lastIndexOf("=\"", position.character))))	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vs-code-intellisense-katapp" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('vs-code-intellisense-katapp.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from VS.Code.Intellisense.KatApp!');
	});

	context.subscriptions.push(disposable);

    // Register a completion item provider for HTML files
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('html', {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
			const htmlLanguageService = getLanguageService();
			const documentContent = document.getText();
			const htmlDocument = htmlLanguageService.parseHTMLDocument(TextDocument.create(document.uri.path, "html", 0, documentContent));
			const offset = document.offsetAt(position);
			const node = htmlDocument.findNodeAt(offset);

			let currentAttribute: string | null = null;
			let attrValuePos = -1;
			for (const attrName in node.attributes) {
				const attrValue = node.attributes[attrName];
				if (attrValue != null) {
					attrValuePos = documentContent.indexOf(attrValue);

					if (offset >= attrValuePos && offset <= attrValuePos + attrValue.length) {
						currentAttribute = attrName;
						break;
					}
				}
			}

			if (!currentAttribute) {
				return []; // cursor is not inside an attribute value
			}

			switch (currentAttribute) {
				case "v-ka-value": {
					const availableProperties = [
						{
							name: "rbl-value id",
							snippet: "${1:id}",
							documentation: "**rbl-value id**\n\n \
`v-ka-value` can simply be assigned to a [`rbl-value` table id](#https://github.com/terryaney/nexgen-documentation/blob/main/KatApp.Vue.md#v-ka-value). \n\n \
`v-ka-value=\"nameFirst\"` will return `value` column from `rbl-value` table row where `@id` column is `nameFirst`."
						},
						{
							name: ". Delimitted String",
							snippet: "${1:table}.${2:keyValue}${3:.returnField}${4:.keyField}${5:.calcEngine}${6:.tab}",
							documentation: "**`.` Delimitted String**\n\nDocumentation for template goes here. \n\n \
`v-ka-value` can be configured to a [RBLe value selector](#https://github.com/terryaney/nexgen-documentation/blob/main/KatApp.Vue.md#v-ka-value) in the format of `table.keyValue.returnField.keyField.calcEngine.tab`. \n\n \
`<!-- Shorthand syntax for example above. -->`\n````````<div v-ka-value=\"name-first\"></div>`."
						},
					];

					return availableProperties.map(property => {
						const item = new vscode.CompletionItem(property.name, vscode.CompletionItemKind.Property);
						const snippet = new vscode.SnippetString(property.snippet);
						item.insertText = snippet;
						const documentation = new vscode.MarkdownString(property.documentation);
						documentation.supportHtml = true;
						documentation.supportThemeIcons = true;
						item.documentation = documentation;
						item.sortText = `0${property.name}`; // Make the suggestions appear in a predictable order
						return item;
					});
				}

				case "v-ka-input": {
					const availableProperties = [
						{
							name: "name",
							snippet: "name: '$1'",
							documentation: "**name**\n\nDocumentation for name goes here. \n\n \
Second line of `code`."
						},
						{
							name: "template",
							snippet: "template: '$1'",
							documentation: "**template**\n\nDocumentation for template goes here. \n\n \
Second line of `code`."
						},
					];

					return availableProperties.map(property => {
						const item = new vscode.CompletionItem(property.name, vscode.CompletionItemKind.Property);
						item.insertText = new vscode.SnippetString(property.snippet);
						const documentation = new vscode.MarkdownString(property.documentation);
						documentation.supportHtml = true;
						documentation.supportThemeIcons = true;
						item.documentation = documentation;
						item.sortText = `0${property.name}`; // Make the suggestions appear in a predictable order
						return item;
					});
				}
			}
			
			return [];
		}
    }));	
}

// This method is called when your extension is deactivated
export function deactivate() {}