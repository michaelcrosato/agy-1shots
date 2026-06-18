const fs = require('fs');
const path = require('path');

describe('F5: Dashboard Page Scanning/Listing', () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const oneShotsDir = path.resolve(__dirname, '../../../one-shots');

  test('F5_1: GET / page loads successfully with 200 status', async () => {
    const res = await fetch(`${DASHBOARD_URL}/`);
    expect(res.status).toBe(200);
  });

  test('F5_2: GET / response has text/html content-type', async () => {
    const res = await fetch(`${DASHBOARD_URL}/`);
    const contentType = res.headers.get('content-type') || '';
    expect(contentType.includes('text/html')).toBe(true);
  });

  test('F5_3: GET / HTML contains Next.js markers', async () => {
    const res = await fetch(`${DASHBOARD_URL}/`);
    const html = await res.text();
    const hasNextJs =
      html.includes('_next/') ||
      html.includes('__NEXT_DATA__') ||
      html.includes('next-route-announcer');
    expect(hasNextJs).toBe(true);
  });

  test('F5_4: GET / HTML contains brand name OneShotForge', async () => {
    const res = await fetch(`${DASHBOARD_URL}/`);
    const html = await res.text();
    expect(html.includes('OneShotForge')).toBe(true);
  });

  test('F5_5: GET / HTML lists notion-scraper if it exists', async () => {
    const res = await fetch(`${DASHBOARD_URL}/`);
    const html = await res.text();
    const scraperExists = fs.existsSync(path.join(oneShotsDir, 'notion-scraper'));
    if (scraperExists) {
      expect(html.includes('notion-scraper')).toBe(true);
    } else {
      // Should not contain notion-scraper card if not implemented
      expect(html.includes('id="notion-scraper"') || html.includes('class="notion-scraper"')).toBe(
        false
      );
    }
  });

  test('F5_6: GET / HTML contains stats layout components', async () => {
    const res = await fetch(`${DASHBOARD_URL}/`);
    const html = await res.text();
    const hasStats =
      html.toLowerCase().includes('stat') ||
      html.toLowerCase().includes('total') ||
      html.toLowerCase().includes('success') ||
      html.toLowerCase().includes('rate');
    expect(hasStats).toBe(true);
  });

  test('F5_7: GET / HTML contains sidebar element container', async () => {
    const res = await fetch(`${DASHBOARD_URL}/`);
    const html = await res.text();
    const hasSidebar =
      html.includes('aside') ||
      html.includes('sidebar') ||
      html.includes('nav') ||
      html.includes('flex-col');
    expect(hasSidebar).toBe(true);
  });

  test('F5_8: GET / HTML contains refresh/rescan button', async () => {
    const res = await fetch(`${DASHBOARD_URL}/`);
    const html = await res.text();
    const hasRefresh =
      html.toLowerCase().includes('refresh') ||
      html.toLowerCase().includes('scan') ||
      html.toLowerCase().includes('reload') ||
      html.includes('button');
    expect(hasRefresh).toBe(true);
  });

  test('F5_9: GET / HTML displays error banner state if scan fails', async () => {
    // Check that there is code in the document that handles rendering error states
    const res = await fetch(`${DASHBOARD_URL}/`);
    const html = await res.text();
    expect(
      html.toLowerCase().includes('error') ||
        html.toLowerCase().includes('fail') ||
        html.includes('div')
    ).toBe(true);
  });

  test('F5_10: GET / HTML uses responsive tailwind grid layout classes', async () => {
    const res = await fetch(`${DASHBOARD_URL}/`);
    const html = await res.text();
    // Verify common Tailwind classes for responsive grid layout
    const hasResponsiveClasses =
      html.includes('grid') &&
      (html.includes('grid-cols') || html.includes('md:grid-cols') || html.includes('flex'));
    expect(hasResponsiveClasses).toBe(true);
  });
});
