# ansible-vault

VSCode extension to encrypt / decrypt `ansible-vault` file as well as selected text. This extension is based on the work of [wolfmah/vscode-ansible-vault-inline](https://gitlab.com/wolfmah/vscode-ansible-vault-inline/).

## Requirements

You need to have an `ansible-vault` executable installed.

## Extension Settings

This extension contributes the following settings:

- `ansible-vault.executable`: Path to an `ansible-vault` executable
- `ansible-vault.passwordFile`: The password file used for encryption and decryption
- `ansible-vault.password`: The password used for encryption and decryption (in case password file is not specified)
