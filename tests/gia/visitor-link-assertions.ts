import { expect, type Page } from '@playwright/test';
import { visitorSafeHref } from '../../lib/gia/visitor-hrefs';

export async function expectSafeVisitorLinks(page: Page) {
  const hrefs = await page.locator('a[href]').evaluateAll(links => links.map(link => link.getAttribute('href') || ''));
  for (const href of hrefs) {
    expect(href, `Unsafe visitor destination: ${href}`).not.toMatch(/github|nexo/i);
    expect(visitorSafeHref(href), `Unsafe visitor destination: ${href}`).not.toBeNull();
  }
}

export async function expectPlainCitation(page: Page, label: string) {
  await expect(page.getByText(label, { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('link', { name: label })).toHaveCount(0);
  await expectSafeVisitorLinks(page);
}
