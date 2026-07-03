import * as vscode from 'vscode';

export type AgentDocsLanguage = 'en' | 'ko';

export function readAgentDocsLanguage(): AgentDocsLanguage {
  const raw = String(vscode.workspace.getConfiguration('markdownAgentDocs').get<string>('language', 'en') || 'en')
    .trim()
    .toLowerCase();
  return raw === 'ko' || raw === 'korean' ? 'ko' : 'en';
}

export function pickLocalized(language: AgentDocsLanguage, values: { en: string; ko: string }): string {
  return language === 'ko' ? values.ko : values.en;
}
