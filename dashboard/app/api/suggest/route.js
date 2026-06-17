import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse("Method Not Allowed", { status: 405 });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new NextResponse(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body || typeof body.id !== "string") {
    return new NextResponse(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = body;

  // Validate ID traversal/existence first for 404.
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    return new NextResponse(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const oneShotsDir = path.resolve(process.cwd(), "../one-shots");
  const targetDir = path.join(oneShotsDir, id);

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return new NextResponse(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const suggestions = [];

  // 1. Analyze package.json
  const pkgPath = path.join(targetDir, "package.json");
  let pkg = null;
  if (!fs.existsSync(pkgPath)) {
    suggestions.push({
      type: "configuration",
      description:
        "Missing package.json file. Every one-shot directory must contain a package.json file to declare name, description, and execution scripts.",
      codeSnippet: JSON.stringify(
        {
          name: id,
          version: "1.0.0",
          description: "",
          main: "index.js",
          scripts: {
            start: "node index.js",
            test: "node index.js --test",
          },
          dependencies: {},
          tags: [],
        },
        null,
        2,
      ),
    });
  } else {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    } catch (e) {
      suggestions.push({
        type: "configuration",
        description:
          "The package.json file is malformed or invalid JSON. Clean and restore the configuration format.",
        codeSnippet: `{\n  "name": "${id}",\n  "version": "1.0.0",\n  "scripts": {\n    "start": "node index.js",\n    "test": "node index.js --test"\n  }\n}`,
      });
    }
  }

  if (pkg) {
    if (!pkg.scripts) {
      suggestions.push({
        type: "configuration",
        description:
          'Missing scripts section in package.json. Add "start" and "test" execution scripts.',
        codeSnippet: `"scripts": {\n  "start": "node index.js",\n  "test": "node index.js --test"\n}`,
      });
    } else {
      if (!pkg.scripts.start) {
        suggestions.push({
          type: "configuration",
          description:
            'Missing "start" script in package.json. The dashboard requires a start script to execute the script.',
          codeSnippet: `"start": "node index.js"`,
        });
      }
      if (!pkg.scripts.test) {
        suggestions.push({
          type: "configuration",
          description:
            'Missing "test" script in package.json. The dashboard and runner require a test script to validate the scraper.',
          codeSnippet: `"test": "node index.js --test"`,
        });
      }
    }

    if (!pkg.tags || !Array.isArray(pkg.tags) || pkg.tags.length === 0) {
      suggestions.push({
        type: "metadata",
        description:
          "Add tags to help categorize and filter this script in the dashboard interface.",
        codeSnippet: `"tags": ["${id.includes("scraper") ? "scraper" : "utility"}", "automation"]`,
      });
    }

    if (
      !pkg.description ||
      typeof pkg.description !== "string" ||
      pkg.description.trim() === ""
    ) {
      suggestions.push({
        type: "metadata",
        description:
          "Add a reader-friendly description to package.json to explain what this one-shot script does on the dashboard cards.",
        codeSnippet: `"description": "A fully functional scraper to process target web pages."`,
      });
    }

    if (id.includes("notion") || pkg.name?.includes("notion")) {
      const deps = pkg.dependencies || {};
      const hasNotionSdk = Object.keys(deps).some((dep) =>
        dep.includes("notion"),
      );
      if (!hasNotionSdk) {
        suggestions.push({
          type: "dependency",
          description:
            "Notion scraper detected but @notionhq/client dependency is missing in package.json. Add the official SDK.",
          codeSnippet: `"dependencies": {\n  "@notionhq/client": "^2.2.15"\n}`,
        });
      }
    }
  }

  // 2. Analyze README.md
  const readmePath = path.join(targetDir, "README.md");
  if (!fs.existsSync(readmePath)) {
    suggestions.push({
      type: "documentation",
      description:
        "Missing README.md file. Create a README.md file in this directory to specify setup parameters, prerequisites, and environment variables.",
      codeSnippet: `# ${id}\n\n## Environment Variables\n- \`VAR_NAME\`: Description of the variable.`,
    });
  } else {
    try {
      const readme = fs.readFileSync(readmePath, "utf8");
      if (readme.trim().length < 50) {
        suggestions.push({
          type: "documentation",
          description:
            "The README.md file is too brief. Expand the documentation with concrete configuration details and quick start instructions.",
          codeSnippet: `## Quick Start\n\`\`\`bash\nnpm install\nnpm start\n\`\`\``,
        });
      }
    } catch (e) {
      // Ignore
    }
  }

  // 3. Analyze source files
  const indexPath = path.join(targetDir, "index.js");
  if (fs.existsSync(indexPath)) {
    try {
      const content = fs.readFileSync(indexPath, "utf8");

      const todoMatches = content.match(/\/\/\s*TODO:?\s*(.*)/gi);
      if (todoMatches) {
        todoMatches.slice(0, 3).forEach((todo) => {
          suggestions.push({
            type: "optimization",
            description: `Address source code TODO item: "${todo.replace(/\/\/\s*TODO:?\s*/gi, "").trim()}"`,
            codeSnippet: todo,
          });
        });
      }

      if (
        content.includes("Mock notion-scraper") ||
        content.includes('console.log("Mock notion-scraper')
      ) {
        suggestions.push({
          type: "implementation",
          description:
            "Dummy mock code detected. Replace console log harness with genuine web scraping or integration API logic.",
          codeSnippet: `// Genuine implementation\nconst { Client } = require('@notionhq/client');\nconst notion = new Client({ auth: process.env.NOTION_TOKEN });`,
        });
      }

      if (
        !content.includes("try") &&
        !content.includes("catch") &&
        content.length > 200
      ) {
        suggestions.push({
          type: "robustness",
          description:
            "No try-catch block detected in main script execution. Wrap asynchronous API and filesystem calls in a try-catch for error resilience.",
          codeSnippet: `try {\n  // asynchronous operations\n} catch (error) {\n  console.error("Execution failed:", error.message);\n  process.exit(1);\n}`,
        });
      }
    } catch (e) {
      // Ignore
    }
  } else {
    suggestions.push({
      type: "implementation",
      description:
        "Missing main execution script (index.js). Create the entry point file to define your script execution path.",
      codeSnippet: `console.log("${id} execution started");`,
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      type: "optimization",
      description:
        "Optimize project configuration and ensure all local dependencies are fully pruned.",
      codeSnippet: "// optimized imports and configuration",
    });
  }

  return NextResponse.json({ suggestions });
}
