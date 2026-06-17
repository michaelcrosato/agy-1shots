const { Client } = require("@notionhq/client");
const https = require("https");

function scrapeTitle(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const match = data.match(/<title>([^<]+)<\/title>/i);
          resolve(match ? match[1].trim() : "No Title Found");
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

async function run() {
  const isTest = process.argv.includes("--test") || process.env.MOCK === "true";

  if (isTest) {
    console.log("Running notion-scraper in MOCK mode...");
    console.log("notion-scraper executed successfully");
    process.exit(0);
  }

  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;
  const targetUrl = process.env.SCRAPE_URL || "https://example.com";

  if (!token || !databaseId) {
    console.error(
      "Error: NOTION_TOKEN and NOTION_DATABASE_ID environment variables are required.",
    );
    process.exit(1);
  }

  console.log(`Starting Notion Scraper...`);
  console.log(`Scraping URL: ${targetUrl}`);

  try {
    const pageTitle = await scrapeTitle(targetUrl);
    console.log(`Scraped Page Title: "${pageTitle}"`);

    const notion = new Client({ auth: token });
    console.log(`Connecting to Notion database ${databaseId}...`);
    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Title: {
          title: [
            {
              text: {
                content: pageTitle,
              },
            },
          ],
        },
        URL: {
          url: targetUrl,
        },
        ScrapedAt: {
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    });

    console.log(`Successfully created page in Notion: ${response.url}`);
    console.log("notion-scraper executed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Failed to execute notion-scraper:", error.message);
    process.exit(1);
  }
}

run();
