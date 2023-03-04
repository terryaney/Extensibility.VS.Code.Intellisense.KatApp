// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'
import { getLanguageService, TextDocument } from 'vscode-html-languageservice';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
// document.getText(document.getWordRangeAtPosition(new vscode.Position(position.line, document.lineAt(position).text.lastIndexOf("=\"", position.character))))	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Activating KatApp Intellisense Extension...');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('vs-code-intellisense-katapp.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from VS.Code.Intellisense.KatApp!');
	});

	context.subscriptions.push(disposable);

	const modelCompletionsPath = path.resolve(__dirname, '../data/katapp.model.completions.json');
	const modelCompletions = JSON.parse(fs.readFileSync(modelCompletionsPath, 'utf8'));

    // Register a completion item provider for HTML files
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('html', {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
			const htmlLanguageService = getLanguageService();
			const documentContent = document.getText();
			const htmlDocument = htmlLanguageService.parseHTMLDocument(TextDocument.create(document.uri.path, "html", 0, documentContent));
			const offset = document.offsetAt(position);
			const node = htmlDocument.findNodeAt(offset);
			const nodeContent = documentContent.substring(node.start, node.end);

			let currentAttribute: string | null = null;
			let currentAttributeValue: string | null = null;
			let attrValuePos = -1;
			for (const attrName in node.attributes) {
				currentAttributeValue = node.attributes[attrName];
				if (currentAttributeValue != null) {
					attrValuePos = nodeContent.indexOf(`${attrName}=${currentAttributeValue}`);
					const attrStartOffset = `${attrName}=`.length
					const attributeStart = node.start + attrValuePos + attrStartOffset;
					const attributeEnd = node.start + attrValuePos + attrStartOffset + currentAttributeValue.length;
					
					if (offset > attributeStart && offset < attributeEnd) {
						currentAttribute = attrName;
						break;
					}
				}
			}

			if (!currentAttribute || ( !currentAttribute.startsWith("v-ka-") && currentAttribute != "v-for" ) ) {
				return []; // cursor is not inside an attribute value
			}

			let sourceCode = currentAttributeValue;
			if (sourceCode?.startsWith("\"")) {
				sourceCode = sourceCode.substring(1);
			}
			if (sourceCode?.endsWith("\"")) {
				sourceCode = sourceCode.substring(0, sourceCode.length - 1);
			}
			const isModel = sourceCode != "" && sourceCode?.startsWith("{");
			const tsSourceFile = isModel
				? ts.createSourceFile(__filename, `var parsed = ${sourceCode}`, ts.ScriptTarget.Latest)
				: undefined;

			const parsedInitializer = (tsSourceFile?.statements[0] as ts.VariableStatement)?.declarationList.declarations[0].initializer!;
			const parsedProperties = (parsedInitializer as ts.ObjectLiteralExpression)?.properties;
			const usedProperties = getUsedProperties(parsedProperties);

			let completionName: string | undefined = undefined;
			let excludedProperties: Array<string> = [];

			switch (currentAttribute) {
				case "v-for":
				case "v-ka-value":
				case "v-ka-resource":
					if (!isModel) {
						completionName = currentAttribute;
					}
					else {
						completionName = `${currentAttribute}.model`;
						
						excludedProperties = modelCompletions[completionName]
							.filter((c: ICompletionItem) => usedProperties.map(p => p.name).indexOf(c.name) != -1)
							.map((c: ICompletionItem) => c.name);
					}
					break;
				
				case "v-ka-input":
					let inputProperties = usedProperties.map(p => p.name);
					const tagName = (node.tag ?? "").toUpperCase();
					completionName = ["INPUT", "SELECT", "TEXTAREA" ].indexOf(tagName) > -1
						? `${currentAttribute}.input`
						: ( !isModel ? currentAttribute : `${currentAttribute}.model` );

					const help = usedProperties.find(p => p.name == "help");

					if (help != undefined) {
						const openBracePos = nodeContent.substring(attrValuePos + help.start, attrValuePos + help.end).indexOf("{");
						const helpModelStart = node.start + attrValuePos + help.start + openBracePos;
						const helpModelEnd = node.start + attrValuePos + help.end;
						if (offset > helpModelStart && offset < helpModelEnd) {
							completionName = `${currentAttribute}.help.model`;
							inputProperties = inputProperties.filter(n => n.startsWith("help.")).map(n => n.split(".")[1]);
						}
					}
					
					if (isModel) {
						excludedProperties = modelCompletions[completionName]
							.filter((c: ICompletionItem) => inputProperties.indexOf(c.name) != -1)
							.map((c: ICompletionItem) => c.name);
					}
					break;
			}

			if (completionName != undefined) {
				const completions = modelCompletions[completionName]
					.filter((property: ICompletionItem) => excludedProperties?.indexOf( property.name ) == -1 )
					.map((property: ICompletionItem, index: number) => {
						const item = new vscode.CompletionItem(property.name, vscode.CompletionItemKind.Property);
						const snippet = new vscode.SnippetString(property.snippet);
						item.insertText = snippet;
						let md = property.documentation.join("\n\n");

						if (property.references != undefined) {
							md += "\n\n\n\n" + property.references.map(r => `[${r.name}](#${r.url}) `).join("| ");
						}

						const documentation = new vscode.MarkdownString(md);
						documentation.supportHtml = true;
						documentation.supportThemeIcons = true;
						item.documentation = documentation;
						item.sortText = `0${index}`; // Make the suggestions appear in a predictable order
						return item;
					});

				return completions;
			}

			return [];
		}
    }));	
}

function getUsedProperties(properties: ts.NodeArray<ts.ObjectLiteralElementLike> | undefined): Array<{name: string, start: number, end: number}> {
	const usedProperties: Array<{name: string, start: number, end: number}> = [];
	// Code for ts compiler is prefixed always with "var parsed = ", so get rid of 13 chars
	// I also get rid of leading/trailing " in attribute value, so have to put position + 1 to handle
	properties?.forEach(property => {
		const propertyName = (property.name as ts.Identifier)?.escapedText ?? "";
		usedProperties.push({ name: propertyName, start: property.pos, end: property.end });
		const propertyInitializer = (property as ts.PropertyAssignment)?.initializer;
		if (propertyInitializer != undefined && ts.isObjectLiteralExpression(propertyInitializer)) {
			const childProperties = getUsedProperties(propertyInitializer.properties);
			childProperties.forEach(childProperty => {
				usedProperties.push({ name: `${propertyName}.${childProperty.name}`, start: childProperty.start - 12, end: childProperty.end - 12 });
			});
		}
	});

	return usedProperties;
}

// This method is called when your extension is deactivated
export function deactivate() { }

interface ICompletionItem {
	name: string;
	snippet: string;
	documentation: Array<string>;
	references?: Array<{ name: string, url: string }>;
}