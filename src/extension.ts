import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';

const tmp = require('tmp');

enum operation {
	ENCRYPT = "encrypt",
	DECRYPT = "decrypt",
};

export function activate(context: vscode.ExtensionContext) {
	const toggleInline = vscode.commands.registerCommand('ansible-vault.toggle-inline', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const document = editor.document;
		const selection = editor.selection;
		if (selection.isEmpty) {
			vscode.window.showErrorMessage('Your selection is empty.');
			return;
		}

		const executable = vscode.workspace.getConfiguration('ansible-vault').get("executable") as string;
		if (!executable) {
			// TODO: check whether executable is actually present!
			vscode.window.showErrorMessage('No executable was found.');
			return;
		};

		const passwordFile = getVaultPasswordFilePath();
		if (!fs.lstatSync(passwordFile).isFile()) {
			vscode.window.showErrorMessage('Password file is not valid.');
			return;
		}

		const content = document.getText(selection).replace('!vault |', '').trim();
		const encrypted = isEncrypted(content);
		const f = tmp.tmpNameSync();

		fs.writeFileSync(f, Buffer.from(content, 'utf8'));
		console.log(`wrote selection to temporary file '${f}'`);

		if (encrypted) {
			console.log("trying to decrypt selection");
			execAnsibleVault(executable, operation.DECRYPT, f, passwordFile);
		} else {
			console.log("trying to encrypt selection");
			execAnsibleVault(executable, operation.ENCRYPT, f, passwordFile);
		};

		let toggled = fs.readFileSync(f, 'utf8');
		if (!encrypted) {
			toggled = "!vault |\n" + toggled;
		}

		editor.edit(editBuilder => {
			editBuilder.replace(selection, toggled);
		});
	});
	const toggleFile = vscode.commands.registerCommand('ansible-vault.toggle-file', () => {
		console.log('toggle-file called');
		vscode.window.showInformationMessage('toggle-file');
	});

	context.subscriptions.push(toggleInline, toggleFile);
}

export function deactivate() {}

let getVaultPasswordFilePath = () => {
	let config = vscode.workspace.getConfiguration('ansible-vault');

	let path = config.passwordFile.trim();
	if (!path.isEmpty) {
		return path;
	}

	let password = config.password.trim();
	if (password.isEmpty) {
		vscode.window.showInputBox({ prompt: "Enter the ansible-vault password: " }).then((val) => {
			password = val;
		});
	}

	path = tmp.tmpNameSync();

	fs.writeFileSync(path, password, 'utf8');

	return path;
};

let isEncrypted = (text : string) => {
	return text.indexOf('$ANSIBLE_VAULT;') === 0;
};

let execAnsibleVault = (executable : string, op : operation, f : string, passwordFile : string) => {
	const cmd = `${executable} ${op} ${f} --vault-password-file=${passwordFile}`;

	console.log(`running command: ${cmd}`);

	return cp.execSync(cmd);
};
