import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const categories = [
  "Automotive & B2B Lead Generation Tools",
  "AI Development, Prompting, Routing & Evaluation Tools",
  "Agent Orchestration, Governance & Sandbox Frameworks",
  "Codebase Engineering & Git Workflow Enhancers",
  "Data, Document & Workspace Productivity Tools",
  "Micro-SaaS Templates & Personal Workflow Apps",
];

function generateReadme(ideas) {
  let md = `# One-Shot Ideas Registry\n\n`;
  md += `Welcome to the One-Shot Ideas Registry. This repository stores, categories, and indexes ideas for standalone utilities, bots, and Micro-SaaS tools that can be generated in "one-shot" by developer agents.\n\n`;
  md += `## Registry Statistics\n`;
  md += `- **Total Ideas**: ${ideas.length}\n`;
  md += `- **Categories**: 6 major technical domains\n\n`;
  md += `---\n\n`;
  md += `## Ideas by Category\n\n`;

  categories.forEach((category) => {
    const categoryIdeas = ideas.filter((idea) => idea.category === category);
    md += `### ${category}\n\n`;
    md += `| ID | Title | Target Stack | Date Added |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    categoryIdeas.forEach((idea) => {
      md += `| \`${idea.id}\` | [${idea.title}](#${idea.id}) | \`${idea.targetStack}\` | ${idea.dateAdded} |\n`;
    });
    md += `\n`;
  });

  md += `---\n\n## Detailed Idea Specs\n\n`;

  ideas.forEach((idea) => {
    md += `### <a name="${idea.id}"></a> ${idea.title}\n\n`;
    md += `- **ID**: \`${idea.id}\`\n`;
    md += `- **Category**: ${idea.category}\n`;
    md += `- **Target Stack**: \`${idea.targetStack}\`\n`;
    md += `- **Date Added**: ${idea.dateAdded}\n\n`;
    md += `#### Core Vision\n${idea.vision}\n\n`;
    md += `#### Technical Specifications\n${idea.techSpecs}\n\n`;
    md += `#### Standardized Task Prompt\n\`\`\`text\n${idea.readyToCopyTaskPrompt}\n\`\`\`\n\n`;
    md += `---\n\n`;
  });

  return md;
}

export async function GET() {
  try {
    const ideasDir = path.resolve(process.cwd(), "../ideas");
    const registryPath = path.join(ideasDir, "registry.json");
    if (!fs.existsSync(registryPath)) {
      return NextResponse.json([], { status: 200 });
    }
    const data = fs.readFileSync(registryPath, "utf8");
    const ideas = JSON.parse(data);
    return NextResponse.json(ideas, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read ideas registry" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json(
        { error: "Bad Request: Invalid JSON" },
        { status: 400 },
      );
    }

    const {
      title,
      category,
      vision,
      techSpecs,
      targetStack,
      readyToCopyTaskPrompt,
    } = body;

    // Perform thorough input validation
    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof category !== "string" ||
      !category.trim() ||
      typeof vision !== "string" ||
      !vision.trim() ||
      typeof techSpecs !== "string" ||
      !techSpecs.trim() ||
      typeof targetStack !== "string" ||
      !targetStack.trim() ||
      typeof readyToCopyTaskPrompt !== "string" ||
      !readyToCopyTaskPrompt.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Validation Error: All fields are required and must be non-empty strings",
        },
        { status: 400 },
      );
    }

    // Enforce security checks: category validation
    if (!categories.includes(category)) {
      return NextResponse.json(
        {
          error: `Validation Error: Category must be one of the allowed categories`,
        },
        { status: 400 },
      );
    }

    // Enforce security checks: block directory traversal and prototype pollution in title and category
    const checks = [title, category];
    for (const val of checks) {
      if (
        val.includes("..") ||
        val.includes("/") ||
        val.includes("\\") ||
        val.includes("__proto__") ||
        val.includes("constructor") ||
        val.includes("prototype")
      ) {
        return NextResponse.json(
          {
            error:
              "Security Error: Directory traversal or prototype pollution patterns detected",
          },
          { status: 400 },
        );
      }
    }

    // Generate a safe id by slugifying title
    let cleanId = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!cleanId) {
      return NextResponse.json(
        {
          error: "Validation Error: Title must contain alphanumeric characters",
        },
        { status: 400 },
      );
    }

    // Ensure only [a-z0-9-] are present
    if (!/^[a-z0-9-]+$/.test(cleanId)) {
      return NextResponse.json(
        { error: "Validation Error: ID contains invalid characters" },
        { status: 400 },
      );
    }

    // Read existing registry
    const ideasDir = path.resolve(process.cwd(), "../ideas");
    const registryPath = path.join(ideasDir, "registry.json");
    const readmePath = path.join(ideasDir, "README.md");

    let ideas = [];
    if (fs.existsSync(registryPath)) {
      const data = fs.readFileSync(registryPath, "utf8");
      ideas = JSON.parse(data);
    }

    // Check for duplicate IDs
    let finalId = cleanId;
    let suffix = 1;
    const existingIds = new Set(ideas.map((item) => item.id));
    while (existingIds.has(finalId)) {
      finalId = `${cleanId}-${suffix}`;
      suffix++;
    }

    const dateAdded = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const newIdea = {
      id: finalId,
      title: title.trim(),
      category: category.trim(),
      vision: vision.trim(),
      techSpecs: techSpecs.trim(),
      targetStack: targetStack.trim(),
      readyToCopyTaskPrompt: readyToCopyTaskPrompt.trim(),
      dateAdded,
    };

    // Append new idea to registry.json
    ideas.push(newIdea);
    fs.writeFileSync(registryPath, JSON.stringify(ideas, null, 2), "utf8");

    // Automatically regenerate README.md
    const readmeContent = generateReadme(ideas);
    fs.writeFileSync(readmePath, readmeContent, "utf8");

    return NextResponse.json(newIdea, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error: " + error.message },
      { status: 500 },
    );
  }
}
