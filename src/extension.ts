import * as vscode from 'vscode';
import { createServer, ServerInfo, setLastMarkdownUri } from './server';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const taskCheckbox = require('markdown-it-task-checkbox');

let serverInfo: ServerInfo | null = null;

export function activate(context: vscode.ExtensionContext) {
  // Start the local server
  serverInfo = createServer();
  context.subscriptions.push({ dispose: () => serverInfo?.dispose() });

  // Track when markdown documents become active
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === 'markdown') {
        setLastMarkdownUri(editor.document.uri);
      }
    })
  );

  // Track initial active editor
  if (vscode.window.activeTextEditor?.document.languageId === 'markdown') {
    setLastMarkdownUri(vscode.window.activeTextEditor.document.uri);
  }

  return {
    extendMarkdownIt(md: any) {
      // Add task checkbox plugin with disabled=false to make them clickable
      md.use(taskCheckbox, { disabled: false });

      // Override list_item renderer to add data-line attribute
      const originalListItemOpen = md.renderer.rules.list_item_open || function(tokens: any, idx: any, options: any, env: any, self: any) {
        return self.renderToken(tokens, idx, options);
      };

      md.renderer.rules.list_item_open = function(tokens: any, idx: any, options: any, env: any, self: any) {
        const token = tokens[idx];
        // markdown-it uses 0-based line numbers in token.map
        // Add 1 to convert to 1-based line numbers that match VS Code's display
        if (token.map && token.map.length > 0) {
          token.attrSet('data-line', (token.map[0] + 1).toString());
        }
        return originalListItemOpen(tokens, idx, options, env, self);
      };

      // Add custom rule to inject server data into the preview
      md.core.ruler.push('checkbox_server_data', (state: any) => {
        // Try to get the source file URI from state.env
        let source = '';
        if (state.env) {
          source = state.env.currentDocument?.uri?.toString()
            || state.env.resourceUri?.toString()
            || state.env.docUri?.toString()
            || state.env.uri?.toString()
            || state.env.source
            || '';
        }

        const token = new state.Token('html_block', '', 0);
        token.content = `<div id="mdCheckboxServerData" style="display:none" data-port="${serverInfo?.port}" data-nonce="${serverInfo?.nonce}" data-source="${source}"></div>`;
        state.tokens.unshift(token);
      });

      return md;
    }
  };
}

export function deactivate() {
  if (serverInfo) {
    serverInfo.dispose();
    serverInfo = null;
  }
}
