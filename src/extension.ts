import * as vscode from "vscode";
import * as fs from "fs";
import * as cp from "child_process";
import tmp from "tmp";

tmp.setGracefulCleanup();

export function activate(context: vscode.ExtensionContext) {
  const toggleInline = vscode.commands.registerCommand(
    "ansible-vault-encryption.toggle-inline",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const document = editor.document;
      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showErrorMessage("Your selection is empty.");
        return;
      }

      let toggled;

      try {
        toggled = await toggleEncryption(
          document
            .getText(selection)
            .replace("!vault |", "")
            .replace(/[^\S\r\n]+/gm, "")
            .trim()
        );
      } catch (error) {
        vscode.window.showErrorMessage((error as Error).message);
        return;
      }

      if (isEncrypted(toggled)) {
        toggled = ("!vault |\n" + toggled).replace(
          /\n/g,
          "\n" + " ".repeat(selection.start.character)
        );
      }

      editor.edit((editBuilder) => {
        editBuilder.replace(selection, toggled);
      });
    }
  );

  const toggleFile = vscode.commands.registerCommand(
    "ansible-vault-encryption.toggle-file",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const document = editor.document;
      let toggled;

      try {
        toggled = await toggleEncryption(document.getText());
      } catch (error) {
        vscode.window.showErrorMessage((error as Error).message);
        return;
      }

      const entireFile = new vscode.Range(
        document.lineAt(0).range.start,
        document.lineAt(document.lineCount - 1).range.end
      );
      editor.edit((editBuilder) => {
        editBuilder.replace(entireFile, toggled);
      });
    }
  );

  context.subscriptions.push(toggleInline, toggleFile);
}

export function deactivate() {}

let toggleEncryption = async (content: string): Promise<string> => {
  const config = vscode.workspace.getConfiguration("ansible-vault");
  const executable = config.get("executable", "ansible-vault") as string;

  let passwordFile;
  let cleanupPasswordFile = false;

  if (config.passwordFile) {
    passwordFile = vscode.workspace.asRelativePath(
      config.passwordFile.trim(),
      true
    );
  } else {
    let password;
    if (config.password) {
      password = config.password.trim();
    } else {
      await vscode.window
        .showInputBox({ prompt: "Enter the ansible-vault password: " })
        .then((val) => {
          password = val;
        });
    }

    passwordFile = tmp.tmpNameSync();
    cleanupPasswordFile = true;

    console.log(`writing artificial password file`);

    fs.writeFileSync(passwordFile, password, "utf8");
  }

  console.log(`vault password file is at '${passwordFile}'`);

  let result: string;

  if (isEncrypted(content)) {
    console.log(`data seems to be encrypted, trying to decrypt`);
    let decrypted = execDecryptAnsibleVault(executable, content, passwordFile);
    result = decrypted.trim();
  } else {
    console.log(`data seems to be unencrypted, trying to encrypt`);
    let encrypted = execEncryptAnsibleVault(executable, content, passwordFile);
    result = encrypted
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .join("\n");
  }

  if (cleanupPasswordFile) {
    fs.rmSync(passwordFile);
  }

  return result;
};

let isEncrypted = (text: string) => {
  return text.indexOf("$ANSIBLE_VAULT;") === 0;
};

let execEncryptAnsibleVault = (
  executable: string,
  content: string,
  passwordFile: string
) => {
  const args = [
    "encrypt_string",
    content,
    "--vault-password-file",
    passwordFile,
  ];

  console.log(`running command: ${executable} ${args}`);

  let opts = {};
  const rootPath = getRootPath();
  if (rootPath) {
    console.log("found root path: " + rootPath);
    opts = { cwd: rootPath };
  }

  const buffer = cp.spawnSync(executable, args, opts);

  return buffer.stdout.toString("utf-8");
};

let execDecryptAnsibleVault = (
  executable: string,
  content: string,
  passwordFile: string
) => {
  const args = ["decrypt", "--vault-password-file", passwordFile];

  console.log(`running command: ${executable} ${args}`);

  let opts: cp.SpawnSyncOptions = { input: content };
  const rootPath = getRootPath();
  if (rootPath) {
    console.log("found root path: " + rootPath);
    opts.cwd = rootPath;
  }

  const buffer = cp.spawnSync(executable, args, opts);

  return buffer.stdout.toString("utf-8");
};

let getRootPath = (): string | undefined => {
  let rootPath: string | undefined;

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return rootPath;
  }

  if (!!vscode.workspace.workspaceFolders) {
    rootPath = vscode.workspace.workspaceFolders.length
      ? vscode.workspace.workspaceFolders[0].name
      : undefined;
  }

  if (!!vscode.workspace.getWorkspaceFolder) {
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(
      editor.document.uri
    );

    if (!!workspaceFolder) {
      rootPath = workspaceFolder.uri.path;
    } else {
      // not under any workspace
      rootPath = undefined;
    }
  }

  return rootPath;
};
