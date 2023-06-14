// To build a .vsix
// Update version in package.json
// `vsce package --out dist`
// `git add dist/*.vsix -f`
// Commit and push

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

	/*
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('vs-code-intellisense-katapp.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from VS.Code.Intellisense.KatApp!');
	});

	context.subscriptions.push(disposable);
	*/
	
	const modelCompletionsPath = path.resolve(__dirname, '../data/katapp.model.completions.json');
	const modelCompletions: Record<string, Array<ICompletionItem>> = JSON.parse(fs.readFileSync(modelCompletionsPath, 'utf8'));

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
			let attrValueStartPos = -1;

			for (const attrName in node.attributes) {
				currentAttributeValue = node.attributes[attrName];
				if (currentAttributeValue != null) {
					const attrNamePos = nodeContent.indexOf(attrName);
					attrValueStartPos = node.start + nodeContent.indexOf(currentAttributeValue, attrNamePos);
					const attributeStart = attrValueStartPos;
					const attributeEnd = attrValueStartPos + currentAttributeValue.length;
					
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
			
			const vueModelCode = `var parsed = ${sourceCode}`;
			const tsSourceFile = isModel
				? ts.createSourceFile(__filename, vueModelCode, ts.ScriptTarget.Latest)
				: undefined;

			const parsedInitializer = (tsSourceFile?.statements[0] as ts.VariableStatement)?.declarationList.declarations[0].initializer!;
			const parsedProperties = (parsedInitializer as ts.ObjectLiteralExpression)?.properties;
			const usedProperties = getUsedProperties(parsedProperties, vueModelCode);

			let completionName: string | undefined = undefined;
			let globalCompletionName: string | undefined = undefined;
			let excludedProperties: Array<string> = [];

			const isInsideModelProperty = (modelPropertyName: string) : boolean => {
				const modelProperty = usedProperties.find(p => p.name == modelPropertyName);
				
				if (modelProperty == undefined) return false;

				// Code for ts compiler is prefixed always with "var parsed = ", so get rid of 13 chars
				// I also get rid of leading/trailing " in attribute value, so have to put position + 1 to handle
				const modelPropertyStart = attrValueStartPos + modelProperty.start - 12;
				const modelPropertyEnd = attrValueStartPos + modelProperty.end - 12;
				return offset > modelPropertyStart && offset < modelPropertyEnd;
			};

			switch (currentAttribute) {
				case "v-for":
				case "v-ka-value":
				case "v-ka-resource":
				case "v-ka-table":
				case "v-ka-highchart":
				case "v-ka-attributes": {
					if (!isModel) {
						completionName = currentAttribute;
					}
					else {
						completionName = `${currentAttribute}.model`;
						
						excludedProperties = modelCompletions[completionName]
							.filter(c => usedProperties.map(p => p.name).indexOf(c.name) != -1)
							.map(c => c.name);
					}
					break;
				}
				
				// Directives with child object properties
				case "v-ka-input":
				case "v-ka-input-group":
				case "v-ka-navigate":
				case "v-ka-template":
				case "v-ka-api":
				case "v-ka-modal":
				case "v-ka-app": {
					let inputProperties = usedProperties.map(p => p.name);
					completionName = !isModel ? currentAttribute : `${currentAttribute}.model`;

					const modelContainerProperties = [
						"inputs", "help", "helps", "css", "events",
						"confirm.labels", "confirm.css", "confirm",
						"source", "calculationInputs", "calculateOnSuccess", "calculateOnConfirm", "apiParameters"
					];

					for (let index = 0; index < modelContainerProperties.length; index++) {
						const property = modelContainerProperties[index];
						if (isInsideModelProperty(property)) {
							completionName = `${currentAttribute}.${property}.model`;
							inputProperties = inputProperties.filter(n => n.startsWith(`${property}`)).map(n => n.split(".").slice(-1)[0]);
							index = modelContainerProperties.length; // just break out of loop
						}
					}

					if (isModel) {		
						globalCompletionName = modelCompletions[completionName]?.[0].globalName;

						excludedProperties = modelCompletions[globalCompletionName ?? completionName]
							.filter(c => inputProperties.indexOf(c.name) != -1)
							.map(c => c.name);
					}
					break;
				}
			}

			if (completionName != undefined) {
				const completionReferences = globalCompletionName != undefined
					? modelCompletions[completionName][0].references
					: undefined;
				
				let completionItems = globalCompletionName != undefined
					? modelCompletions[globalCompletionName].map<ICompletionItem>(i => ({
						name: i.name,
						documentation: i.documentation,
						snippet: i.snippet,
						references: (completionReferences ?? []).concat(i.references ?? [])
					}))
					: modelCompletions[completionName]

				if (completionItems.find(i => i.globalInclude != undefined) != undefined) {
					const mergedCompletionItems: Array<ICompletionItem> = [];

					completionItems.forEach(i => {
						if (i.globalInclude == undefined) {
							mergedCompletionItems.push(i);
						}
						else {
							modelCompletions[i.globalInclude].map<ICompletionItem>(gi => ({
								name: gi.name,
								documentation: gi.documentation,
								snippet: gi.snippet,
								references: (completionReferences ?? []).concat(gi.references ?? [])
							})).forEach(gi => mergedCompletionItems.push(gi));
						}
					});

					completionItems = mergedCompletionItems;
				}
				
				const completions = completionItems
					.filter(property => excludedProperties?.indexOf( property.name ) == -1 )
					.map((property, index) => {
						const item = new vscode.CompletionItem(property.name, vscode.CompletionItemKind.Property);
						const snippet = new vscode.SnippetString(property.snippet);
						item.insertText = snippet;
						let md = property.documentation.join("\n\n");

						if (property.references != undefined && property.references.length > 0) {
							md += "\n\n\n\n" + property.references.map(r => `[${r.name}](${r.url}) `).join("| ");
						}

						const documentation = new vscode.MarkdownString(md);
						documentation.supportHtml = true;
						documentation.supportThemeIcons = true;
						item.documentation = documentation;
						item.sortText = index.toString().padStart(5, '0');
						return item;
					});

				return completions;
			}

			return [];
		}
    }));	
}

function getUsedProperties(properties: ts.NodeArray<ts.ObjectLiteralElementLike> | undefined, vueModelCode: string): Array<IModelProperty> {
	const usedProperties: Array<IModelProperty> = [];

	properties?.forEach(property => {
		const propertyName = (property.name as ts.Identifier)?.escapedText ?? "";
		usedProperties.push({
			name: propertyName,
			start: vueModelCode.indexOf(":", property.pos) + 1,
			end: property.end
		});
		const propertyInitializer = (property as ts.PropertyAssignment)?.initializer;
		if (propertyInitializer != undefined && ts.isObjectLiteralExpression(propertyInitializer)) {
			const childProperties = getUsedProperties(propertyInitializer.properties, vueModelCode);
			childProperties.forEach(childProperty => {
				usedProperties.push({ name: `${propertyName}.${childProperty.name}`, start: childProperty.start, end: childProperty.end });
			});
		}
	});

	return usedProperties;
}

// This method is called when your extension is deactivated
export function deactivate() { }

interface ICompletionItem {
	globalName?: string;
	globalInclude?: string;
	name: string;
	snippet: string;
	documentation: Array<string>;
	references?: Array<{ name: string, url: string }>;
}
interface IModelProperty {
	name: string;
	start: number;
	end: number;
}