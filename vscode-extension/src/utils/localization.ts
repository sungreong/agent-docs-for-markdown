import * as vscode from 'vscode';

export type MdStudioLanguage = 'en' | 'ko';

export function readMdStudioLanguage(): MdStudioLanguage {
  const raw = String(vscode.workspace.getConfiguration('mdStudioPreview').get<string>('language', 'en') || 'en')
    .trim()
    .toLowerCase();
  return raw === 'ko' || raw === 'korean' ? 'ko' : 'en';
}

export function pickLocalized(language: MdStudioLanguage, values: { en: string; ko: string }): string {
  return language === 'ko' ? values.ko : values.en;
}
