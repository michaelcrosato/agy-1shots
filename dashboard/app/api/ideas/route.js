import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { writeFileAtomic } from '../../../lib/atomic-file';

export const dynamic = 'force-dynamic';

const categories = [
  'Automotive & B2B Lead Generation Tools',
  'AI Development, Prompting, Routing & Evaluation Tools',
  'Agent Orchestration, Governance & Sandbox Frameworks',
  'Codebase Engineering & Git Workflow Enhancers',
  'Data, Document & Workspace Productivity Tools',
  'Micro-SaaS Templates & Personal Workflow Apps',
];

export function generateIdeasReadme(ideas) {
  const categoriesList = [
    'Automotive & B2B Lead Generation Tools',
    'AI Development, Prompting, Routing & Evaluation Tools',
    'Agent Orchestration, Governance & Sandbox Frameworks',
    'Codebase Engineering & Git Workflow Enhancers',
    'Data, Document & Workspace Productivity Tools',
    'Micro-SaaS Templates & Personal Workflow Apps',
  ];

  let md = `# One-Shot Ideas Registry\n\n`;
  md += `Welcome to the One-Shot Ideas Registry. This repository stores, categories, and indexes ideas for standalone utilities, bots, and Micro-SaaS tools that can be generated in "one-shot" by developer agents.\n\n`;
  md += `## Registry Statistics\n`;
  md += `- **Total Ideas**: ${ideas.length}\n`;
  md += `- **Categories**: 6 major technical domains\n\n`;
  md += `---\n\n`;
  md += `## Ideas by Category\n\n`;

  categoriesList.forEach((category) => {
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
    md += `- **Date Added**: ${idea.dateAdded}\n`;
    md += `- **Status**: \`${idea.status || 'backlog'}\`\n`;
    md += `- **Promoted To**: ${idea.promoted_to !== undefined && idea.promoted_to !== null ? idea.promoted_to : 'null'}\n`;
    md += `- **Supersedes**: ${idea.supersedes !== undefined && idea.supersedes !== null ? idea.supersedes : 'null'}\n\n`;
    md += `#### Core Vision\n${idea.vision}\n\n`;
    md += `#### Technical Specifications\n${idea.techSpecs}\n\n`;
    md += `#### Standardized Task Prompt\n\`\`\`text\n${idea.readyToCopyTaskPrompt}\n\`\`\`\n\n`;
    md += `---\n\n`;
  });

  return md;
}

export function generateIdeasMd(ideas) {
  const categoriesList = [
    'Automotive & B2B Lead Generation Tools',
    'AI Development, Prompting, Routing & Evaluation Tools',
    'Agent Orchestration, Governance & Sandbox Frameworks',
    'Codebase Engineering & Git Workflow Enhancers',
    'Data, Document & Workspace Productivity Tools',
    'Micro-SaaS Templates & Personal Workflow Apps',
  ];

  const promotedIdeas = ideas.filter((i) => i.status === 'promoted');
  const promotedTitles = promotedIdeas.map((i) => i.title);
  const promotedStr = promotedTitles.length > 0 ? ` (${promotedTitles.join(', ')})` : '';
  const backlogCount = ideas.filter((i) => i.status === 'backlog').length;

  let md = `# One-Shot Ideas Backlog\n\n`;
  md += `This document lists all ideas available in the registry, including their current lifecycle status.\n\n`;
  md += `## Backlog Statistics\n`;
  md += `- **Stats**: ${ideas.length} total ideas, ${promotedIdeas.length} promoted${promotedStr}\n`;
  md += `- **Backlog Ideas**: ${backlogCount}\n\n`;
  md += `---\n\n`;
  md += `## Category Summary\n\n`;

  categoriesList.forEach((category) => {
    const categoryIdeas = ideas.filter((idea) => idea.category === category);
    md += `### ${category}\n\n`;
    md += `| ID | Title | Target Stack | Status | Promoted To |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    categoryIdeas.forEach((idea) => {
      const status = idea.status || 'backlog';
      const promoted_to = idea.promoted_to;
      let promoted_to_val = '-';
      if (status === 'promoted' && promoted_to) {
        promoted_to_val = `\`${promoted_to}\``;
      }
      md += `| \`${idea.id}\` | [${idea.title}](#${idea.id}) | \`${idea.targetStack}\` | \`${status}\` | ${promoted_to_val} |\n`;
    });
    md += `\n`;
  });

  md += `---\n\n## Backlog Details\n\n`;

  ideas.forEach((idea) => {
    md += `### <a name="${idea.id}"></a> ${idea.title}\n\n`;
    md += `- **ID**: \`${idea.id}\`\n`;
    md += `- **Category**: ${idea.category}\n`;
    md += `- **Target Stack**: \`${idea.targetStack}\`\n`;
    md += `- **Status**: \`${idea.status || 'backlog'}\`\n`;
    if (idea.status === 'promoted' && idea.promoted_to) {
      md += `- **Promoted To**: \`one-shots/${idea.promoted_to}/\`\n`;
    }
    md += `- **Date Added**: ${idea.dateAdded}\n\n`;
    md += `#### Vision\n${idea.vision}\n\n`;
    md += `#### Technical Specifications\n${idea.techSpecs}\n\n`;
    md += `#### Task Prompt\n\`\`\`text\n${idea.readyToCopyTaskPrompt}\n\`\`\`\n\n`;
    md += `---\n\n`;
  });

  return md;
}

export async function GET() {
  try {
    const ideasDir = path.resolve(process.cwd(), '../ideas');
    const registryPath = path.join(ideasDir, 'registry.json');
    if (!fs.existsSync(registryPath)) {
      return NextResponse.json([], { status: 200 });
    }
    const data = fs.readFileSync(registryPath, 'utf8');
    const ideas = JSON.parse(data).map((idea) => ({
      ...idea,
      status: idea.status || 'backlog',
      promoted_to: idea.promoted_to !== undefined ? idea.promoted_to : null,
      supersedes: idea.supersedes !== undefined ? idea.supersedes : null,
    }));
    return NextResponse.json(ideas, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read ideas registry' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json({ error: 'Bad Request: Invalid JSON' }, { status: 400 });
    }

    const { title, category, vision, techSpecs, targetStack, readyToCopyTaskPrompt } = body;

    // Perform thorough input validation
    if (
      typeof title !== 'string' ||
      !title.trim() ||
      typeof category !== 'string' ||
      !category.trim() ||
      typeof vision !== 'string' ||
      !vision.trim() ||
      typeof techSpecs !== 'string' ||
      !techSpecs.trim() ||
      typeof targetStack !== 'string' ||
      !targetStack.trim() ||
      typeof readyToCopyTaskPrompt !== 'string' ||
      !readyToCopyTaskPrompt.trim()
    ) {
      return NextResponse.json(
        {
          error: 'Validation Error: All fields are required and must be non-empty strings',
        },
        { status: 400 }
      );
    }

    // Enforce security checks: category validation
    if (!categories.includes(category)) {
      return NextResponse.json(
        {
          error: `Validation Error: Category must be one of the allowed categories`,
        },
        { status: 400 }
      );
    }

    // Enforce security checks: block directory traversal and prototype pollution in title and category
    const checks = [title, category];
    for (const val of checks) {
      if (
        val.includes('..') ||
        val.includes('/') ||
        val.includes('\\') ||
        val.includes('__proto__') ||
        val.includes('constructor') ||
        val.includes('prototype')
      ) {
        return NextResponse.json(
          {
            error: 'Security Error: Directory traversal or prototype pollution patterns detected',
          },
          { status: 400 }
        );
      }
    }

    // Read existing registry
    const ideasDir = path.resolve(process.cwd(), '../ideas');
    const registryPath = path.join(ideasDir, 'registry.json');
    const readmePath = path.join(ideasDir, 'README.md');
    const ideasMdPath = path.resolve(process.cwd(), '../IDEAS.md');

    let ideas = [];
    if (fs.existsSync(registryPath)) {
      const data = fs.readFileSync(registryPath, 'utf8');
      ideas = JSON.parse(data);
    }

    const prefixMap = {
      'Automotive & B2B Lead Generation Tools': 'AUTO',
      'AI Development, Prompting, Routing & Evaluation Tools': 'LLM',
      'Agent Orchestration, Governance & Sandbox Frameworks': 'AGENT',
      'Codebase Engineering & Git Workflow Enhancers': 'CODE',
      'Data, Document & Workspace Productivity Tools': 'DATA',
      'Micro-SaaS Templates & Personal Workflow Apps': 'MICRO',
    };

    const prefix = prefixMap[category];
    const count = ideas.filter((idea) => idea.category === category).length;
    const nextIdNumber = count + 1;
    const finalId = `${prefix}-${String(nextIdNumber).padStart(3, '0')}`;

    const dateAdded = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const newIdea = {
      id: finalId,
      title: title.trim(),
      category: category.trim(),
      vision: vision.trim(),
      techSpecs: techSpecs.trim(),
      targetStack: targetStack.trim(),
      readyToCopyTaskPrompt: readyToCopyTaskPrompt.trim(),
      dateAdded,
      status: 'backlog',
      promoted_to: null,
      supersedes: null,
    };

    // Append new idea to registry.json. Atomic write: registry.json is the
    // machine source of truth (every GET JSON.parses it), so a torn write would
    // 500 all subsequent reads.
    ideas.push(newIdea);
    writeFileAtomic(registryPath, JSON.stringify(ideas, null, 2));

    // Automatically regenerate README.md and root IDEAS.md
    const readmeContent = generateIdeasReadme(ideas);
    writeFileAtomic(readmePath, readmeContent);

    const ideasMdContent = generateIdeasMd(ideas);
    writeFileAtomic(ideasMdPath, ideasMdContent);

    return NextResponse.json(newIdea, { status: 200 });
  } catch (error) {
    // Log the detail server-side; return a generic 500 so internal error text
    // (e.g. filesystem paths) isn't leaked to the client — matching the other
    // API routes (e.g. polish).
    console.error('POST /api/ideas failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
