import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface TemplateBuilderPanelOptions {
  htmlFilePath: string;   // absolute path to public/template-builder-vscode.html
  onGenerate: (markdown: string) => Promise<void>;
  onInsert: (markdown: string) => Promise<void>;
  onCopy: (markdown: string) => Promise<void>;
  onPreview?: (markdown: string) => Promise<void>;
  initialData?: unknown;
}

/**
 * Creates the Template Builder WebviewPanel by loading the VS Code-dedicated
 * `public/template-builder-vscode.html` file and injecting a nonce-based
 * Content-Security-Policy + VS Code bridge.
 *
 * The browser app shell remains outside the VS Code extension package.
 */
export async function createTemplateBuilderPanel(
  context: vscode.ExtensionContext,
  options: TemplateBuilderPanelOptions,
): Promise<vscode.WebviewPanel> {
  const publicDirUri = vscode.Uri.file(path.dirname(options.htmlFilePath));

  const panel = vscode.window.createWebviewPanel(
    'markdownAgentDocsTemplateBuilder',
    'MPS · Template Builder',
    { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
    {
      enableScripts: true,
      localResourceRoots: [publicDirUri],
      retainContextWhenHidden: true,
    },
  );

  // Load VS Code HTML and patch CSP / nonce for webview security
  let html = await fs.readFile(options.htmlFilePath, 'utf8');
  const nonce = getNonce();
  html = patchHtmlForWebview(html, nonce, panel.webview, publicDirUri);

  // Inject document.css inline so Shadow DOM preview can use it without external fetch
  const docCssPath = path.join(path.dirname(options.htmlFilePath), 'document.css');
  let docCss = '';
  try { docCss = await fs.readFile(docCssPath, 'utf8'); } catch { /* optional */ }
  const docCssScript = `<script nonce="${nonce}">window.__MPS_DOC_CSS__ = ${JSON.stringify(docCss)};</script>`;
  html = html.replace('</head>', `${docCssScript}\n</head>`);

  panel.webview.html = html;
  const sendHydration = () => {
    if (options.initialData) {
      void panel.webview.postMessage({ type: 'hydrate', payload: options.initialData });
    }
  };
  sendHydration();

  panel.webview.onDidReceiveMessage(
    async (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const msg = message as { type?: string; markdown?: string };

      if (msg.type === 'ready') {
        sendHydration();
      }
      if (msg.type === 'generate' && typeof msg.markdown === 'string') {
        await options.onGenerate(msg.markdown);
      }
      if (msg.type === 'insert' && typeof msg.markdown === 'string') {
        await options.onInsert(msg.markdown);
      }
      if (msg.type === 'copy' && typeof msg.markdown === 'string') {
        await options.onCopy(msg.markdown);
      }
      if (msg.type === 'preview' && typeof msg.markdown === 'string' && options.onPreview) {
        await options.onPreview(msg.markdown);
      }
    },
    undefined,
    context.subscriptions,
  );

  return panel;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Patches the shared HTML file for secure use inside VS Code Webview:
 * - Adds a Content-Security-Policy meta tag with a nonce
 * - Adds nonce attribute to all inline <script> tags
 */
function patchHtmlForWebview(
  html: string,
  nonce: string,
  webview: vscode.Webview,
  publicDirUri: vscode.Uri
): string {
  const webviewPublicUri = webview.asWebviewUri(publicDirUri).toString();

  const csp = [
    "default-src 'none'",
    `style-src 'unsafe-inline' https://fonts.googleapis.com ${webviewPublicUri}`,
    `font-src https://fonts.gstatic.com`,
    `script-src 'nonce-${nonce}' ${webviewPublicUri} 'unsafe-eval'`, // unsafe-eval needed for templates sometimes
    `connect-src 'none'`,
  ].join('; ');

  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;

  // Replace absolute root paths to point to VS Code webview URI
  // Example: import { ... } from '/core/snippets.js' -> import { ... } from 'vscode-webview://.../core/snippets.js'
  html = html.replace(/(['"])\/(core|document\.css)/g, `$1${webviewPublicUri}/$2`);

  // Inject webview public URI as a global JS variable so dynamic srcdoc builders can use it
  const publicUriScript = `<script nonce="${nonce}">window.__MPS_PUBLIC_URI__ = ${JSON.stringify(webviewPublicUri)};</script>`;

  // Insert CSP and public URI script after <head>
  html = html.replace(/(<head[^>]*>)/i, `$1\n  ${cspTag}\n  ${publicUriScript}`);

  // Add nonce to all inline <script> tags
  html = html.replace(/<script(?!\s+src)(?!\s+nonce)([\s>])/gi, `<script nonce="${nonce}"$1`);

  return html;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
