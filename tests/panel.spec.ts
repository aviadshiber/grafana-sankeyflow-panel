import { test, expect } from '@grafana/plugin-e2e';
import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

const consoleErrors = new WeakMap<Page, string[]>();
const pluginAssetPrefix = '/public/plugins/aviadshiber-sankeyflow-panel/';

function isKnownGrafanaNoise(message: string) {
  return (
    message.startsWith('[OFREP] Failed to initialize feature flags:') ||
    message === 'Failed to load resource: net::ERR_CONNECTION_REFUSED' ||
    message === 'Failed to load resource: the server responded with a status of 404 (Not Found)' ||
    message === 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)' ||
    (message.startsWith('Could not register link extension.') &&
      message.includes('pluginId: grafana-metricsdrilldown-app'))
  );
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.url().includes(pluginAssetPrefix)) {
      errors.push(`SankeyFlow request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown error'})`);
    }
  });
  page.on('response', (response) => {
    if (response.url().includes(pluginAssetPrefix) && response.status() >= 400) {
      errors.push(`SankeyFlow response failed: ${response.status()} ${response.url()}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  const errors = consoleErrors.get(page) ?? [];
  await expect(errors.filter((message) => !isKnownGrafanaNoise(message))).toEqual([]);
});

function sankeyPanel(panelEditPage: { panel: { locator: ReturnType<Page['locator']> } }) {
  return panelEditPage.panel.locator.locator('section[aria-label^="Sankey flow:"]');
}

async function expectPanelToBeReady(panel: ReturnType<typeof sankeyPanel>) {
  await expect(panel).toBeVisible();
  await expect(panel.locator('svg[aria-label^="Sankey diagram,"]')).toBeVisible();
}

test('renders an edge DAG with node/link semantics, search, keyboard selection, and an accessible table', async ({
  gotoPanelEditPage,
  page,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = sankeyPanel(panelEditPage);

  await expectPanelToBeReady(panel);
  await expect(panel).toHaveAttribute('aria-label', /5 nodes, 4 links, total 32/);
  await expect(panel.getByRole('button', { name: 'Source to Inspect: 12' })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Transform to Publish: 8' })).toHaveCount(1);

  const table = panel.getByRole('table', { name: 'Sankey flow data' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(5);
  await expect(table.getByRole('columnheader', { name: 'Source' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Target' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Value' })).toBeVisible();
  await expect(table.getByRole('row').nth(1).getByRole('cell').nth(0)).toHaveText('Source');
  await expect(table.getByRole('row').nth(1).getByRole('cell').nth(1)).toHaveText('Inspect');
  await expect(table.getByRole('row').nth(1).getByRole('cell').nth(2)).toHaveText('12');
  await expect(table.getByRole('row').nth(4).getByRole('cell').nth(0)).toHaveText('Transform');
  await expect(table.getByRole('row').nth(4).getByRole('cell').nth(1)).toHaveText('Publish');
  await expect(table.getByRole('row').nth(4).getByRole('cell').nth(2)).toHaveText('8');

  const source = panel.getByRole('button', { name: /^Source · 12/ });
  await source.focus();
  await source.press('Enter');
  await expect(source).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('status', { name: 'Selection details' })).toHaveText('Source: 12');

  const search = panel.getByRole('searchbox', { name: 'Search Sankey flow' });
  await search.fill('Reject');
  await expect(panel.getByRole('button', { name: /^Reject · 4/ }).locator('rect')).toHaveAttribute('fill-opacity', '1');
  await expect(source.locator('rect')).toHaveAttribute('fill-opacity', '0.08');

  const axeResults = await new AxeBuilder({ page }).include('section[aria-label^="Sankey flow:"]').analyze();
  expect(axeResults.violations).toEqual([]);
});

test('renders multi-stage path data with stage headers and aggregated path links', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '2' });
  const panel = sankeyPanel(panelEditPage);

  await expectPanelToBeReady(panel);
  await expect(panel).toHaveAttribute('aria-label', /4 nodes, 3 links, total 20/);
  await expect(panel.locator('text=Stage 1')).toBeVisible();
  await expect(panel.locator('text=Stage 2')).toBeVisible();
  await expect(panel.locator('text=Stage 3')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Visit to Checkout: 10' })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Checkout to Paid: 7' })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Checkout to Abandoned: 3' })).toHaveCount(1);
});

test('renders circular edge data and exposes the cycle diagnostic', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '3' });
  const panel = sankeyPanel(panelEditPage);

  await expectPanelToBeReady(panel);
  await expect(panel).toHaveAttribute('aria-label', /3 nodes, 3 links, total 10/);
  await expect(panel.getByRole('button', { name: 'C to A: 2' })).toBeVisible();
  await expect(panel.getByText('Diagnostics (1)')).toBeVisible();
  await expect(panel).toContainText('The graph contains a cycle.');
});

test('plays time-bucketed frames and exposes deterministic playback controls', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '4' });
  const panel = sankeyPanel(panelEditPage);

  await expectPanelToBeReady(panel);
  const controls = panel.getByRole('group', { name: 'Playback controls' });
  await expect(controls).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(controls.getByRole('slider', { name: 'Playback position' })).toHaveAttribute('max', '2');
  await expect(controls.getByRole('button', { name: 'Loop' })).toHaveAttribute('aria-pressed', 'false');
  await expect(controls.getByRole('button', { name: 'Loop' })).toBeVisible();
  await expect(controls.getByRole('combobox', { name: 'Playback speed' })).toHaveValue('1');
  await expect(controls.getByRole('button', { name: 'Pause' })).toHaveCount(0);

  await expect(controls.locator('output[aria-label="Current timestamp"]')).toHaveText('2024-01-01T00:00:00.000Z');
  await controls.getByRole('slider', { name: 'Playback position' }).fill('1');
  await expect(controls.locator('output[aria-label="Current timestamp"]')).toHaveText('2024-01-01T00:01:00.000Z');

  await controls.getByRole('button', { name: 'Loop' }).click();
  await expect(controls.getByRole('button', { name: 'Loop' })).toHaveAttribute('aria-pressed', 'true');
  await controls.getByRole('button', { name: 'Play' }).click();
  await expect(controls.getByRole('button', { name: 'Pause' })).toBeVisible();
  await controls.getByRole('button', { name: 'Pause' }).click();
});

test('renders a stable empty state with diagnostics for missing data', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '5' });
  const state = panelEditPage.panel.locator.getByRole('status');

  await expect(state).toBeVisible();
  await expect(state).toContainText('No Sankey flow to display');
  await expect(state).toContainText('No data frames were supplied.');
});

test('uses the hybrid renderer for a high-cardinality graph while retaining SVG semantics', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '6' });
  const panel = sankeyPanel(panelEditPage);

  await expectPanelToBeReady(panel);
  await expect(panel.locator('canvas[aria-hidden="true"]')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Node 00 to Node 01: 1' })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Node 18 to Node 19: 1' })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Node 00 to Node 01: 1' })).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.getByRole('table', { name: 'Sankey flow data' }).getByRole('row')).toHaveCount(20);
});
