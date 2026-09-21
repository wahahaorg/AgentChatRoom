'use client';

import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

export function LocaleToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();

  const toggle = () => setLocale(locale === 'en' ? 'zh' : 'en');

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label="Switch language"
      title="Switch language / 切换语言"
      className={compact ? 'w-full' : ''}
    >
      {locale === 'en' ? '中文' : 'English'}
    </Button>
  );
}
