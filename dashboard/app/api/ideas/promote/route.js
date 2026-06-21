import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextResponse } from 'next/server';
import { generateIdeasReadme, generateIdeasMd } from '../route';
import { writeFileAtomic } from '../../../../lib/atomic-file';

export const dynamic = 'force-dynamic';

function getSlug(title) {
  const titleLower = title.toLowerCase().trim();
  if (titleLower === 'notion scraper') return 'notion-scraper';

  const parts = titleLower.split(/[,:]/);
  const primaryPart = parts[0].trim();

  let slug = primaryPart.replace(/[^a-z0-9]+/g, '-');
  slug = slug.replace(/-+/g, '-');
  slug = slug.replace(/^-|-$/g, '');
  return slug;
}

export async function POST(request) {
  // Tracked at handler scope so the catch can roll back a partial scaffold.
  let oneShotDir = null;
  let createdDir = false;
  let registryCommitted = false;
  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json({ error: 'Bad Request: Invalid JSON' }, { status: 400 });
    }

    const { id } = body;
    if (typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ error: 'Validation Error: id is required' }, { status: 400 });
    }

    const ideasDir = path.resolve(process.cwd(), '../ideas');
    const registryPath = path.join(ideasDir, 'registry.json');
    const readmePath = path.join(ideasDir, 'README.md');
    const ideasMdPath = path.resolve(process.cwd(), '../IDEAS.md');

    if (!fs.existsSync(registryPath)) {
      return NextResponse.json({ error: 'Error: Registry file not found' }, { status: 404 });
    }

    const ideas = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const idea = ideas.find((item) => item.id === id);

    if (!idea) {
      return NextResponse.json({ error: `Error: Idea with ID ${id} not found` }, { status: 404 });
    }

    if (idea.status === 'promoted') {
      return NextResponse.json({ error: `Idea ${id} is already promoted` }, { status: 400 });
    }

    const slug = getSlug(idea.title);
    const repoRoot = path.resolve(process.cwd(), '..');
    oneShotDir = path.join(repoRoot, 'one-shots', slug);

    if (fs.existsSync(oneShotDir)) {
      return NextResponse.json(
        { error: `Error: Target one-shot directory already exists at one-shots/${slug}` },
        { status: 409 }
      );
    }

    fs.mkdirSync(oneShotDir, { recursive: true });
    createdDir = true;

    // 1. Create oneshot.json
    const nowIso = new Date().toISOString();
    let osName = os.platform();
    if (osName === 'win32') {
      osName = 'Windows';
    } else if (osName === 'darwin') {
      osName = 'macOS';
    }
    const osBuild = os.release();

    const oneshotData = {
      schemaVersion: 1,
      spec: {
        vision: idea.vision,
        createdAt: nowIso,
        acceptance: {
          mode: 'program',
          script: 'verify',
          successExitCode: 0,
        },
      },
      attempts: [
        {
          id: 'att_seed',
          timestamp: nowIso,
          model: 'Gemini 3.5 Flash',
          environment: {
            tool: 'OneShotForge UI',
            toolBuild: '1.0.0',
            os: osName,
            osBuild: osBuild,
          },
          build: {
            tokens: null,
            durationMs: null,
          },
          evaluation: {
            method: 'none',
            fidelityScore: null,
            passed: null,
            feedback: '',
            evaluatedAt: null,
          },
        },
      ],
    };

    const oneshotPath = path.join(oneShotDir, 'oneshot.json');
    fs.writeFileSync(oneshotPath, JSON.stringify(oneshotData, null, 2), 'utf8');

    // 2. Choose file structure based on stack
    const stack = idea.targetStack || '';
    const stackLower = stack.toLowerCase();
    let mainFilename, mainContent, verifyFilename, verifyContent, startCmd, testCmd, verifyCmd;

    if (stackLower.includes('python')) {
      mainFilename = 'main.py';
      mainContent = 'print("Hello from OneShotForge!")\n';
      verifyFilename = 'verify.py';
      verifyContent = 'import sys\nprint("Verification passed!")\nsys.exit(0)\n';
      startCmd = 'python main.py';
      testCmd = 'python verify.py';
      verifyCmd = 'python verify.py';
    } else if (stackLower.includes('rust')) {
      mainFilename = 'src/main.rs';
      mainContent = 'fn main() {\n    println!("Hello from OneShotForge!");\n}\n';
      verifyFilename = 'verify.py';
      verifyContent = 'import sys\nprint("Verification passed!")\nsys.exit(0)\n';
      startCmd = 'cargo run';
      testCmd = 'cargo test';
      verifyCmd = 'python verify.py';
    } else if (
      stackLower.includes('node') ||
      stackLower.includes('js') ||
      stackLower.includes('react')
    ) {
      mainFilename = 'index.js';
      mainContent = 'console.log("Hello from OneShotForge!");\n';
      verifyFilename = 'verify.js';
      verifyContent = 'console.log("Verification passed!");\nprocess.exit(0);\n';
      startCmd = 'node index.js';
      testCmd = 'node verify.js';
      verifyCmd = 'node verify.js';
    } else {
      mainFilename = 'main.py';
      mainContent = 'print("Hello from OneShotForge!")\n';
      verifyFilename = 'verify.py';
      verifyContent = 'import sys\nprint("Verification passed!")\nsys.exit(0)\n';
      startCmd = 'python main.py';
      testCmd = 'python verify.py';
      verifyCmd = 'python verify.py';
    }

    // 3. Create package.json
    const tags = stack
      .split(/,|\bor\b/i)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const dedupedTags = [...new Set(tags)];

    const packageData = {
      name: slug,
      version: '1.0.0',
      description: idea.vision,
      main: mainFilename.replace('src/', ''),
      scripts: {
        start: startCmd,
        test: testCmd,
        verify: verifyCmd,
      },
      tags: dedupedTags,
    };

    const packagePath = path.join(oneShotDir, 'package.json');
    fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2), 'utf8');

    // 4. Create main source file
    const mainPath = path.join(oneShotDir, mainFilename);
    fs.mkdirSync(path.dirname(mainPath), { recursive: true });
    fs.writeFileSync(mainPath, mainContent, 'utf8');

    // 5. Create verify script
    const verifyPath = path.join(oneShotDir, verifyFilename);
    fs.writeFileSync(verifyPath, verifyContent, 'utf8');

    // 6. Create local README.md
    const readmeLocalContent = `# ${idea.title}

## Vision
${idea.vision}

## Technical Specifications
${idea.techSpecs}

## Target Stack
${stack}

## Standardized Task Prompt
\`\`\`text
${idea.readyToCopyTaskPrompt}
\`\`\`

## Setup & Run Instructions
1. Setup your environment and dependencies.
2. Run the start command:
   \`\`\`bash
   ${startCmd}
   \`\`\`
3. Run tests or verify the script:
   \`\`\`bash
   ${testCmd}
   \`\`\`
`;
    const readmeLocalPath = path.join(oneShotDir, 'README.md');
    fs.writeFileSync(readmeLocalPath, readmeLocalContent, 'utf8');

    // 7. Update status in registry.json. Atomic write: a torn registry.json
    // would 500 every subsequent GET /api/ideas that JSON.parses it.
    idea.status = 'promoted';
    idea.promoted_to = slug;

    writeFileAtomic(registryPath, JSON.stringify(ideas, null, 2));
    registryCommitted = true;

    // 8. Regenerate registry README.md and root IDEAS.md
    const registryReadmeContent = generateIdeasReadme(ideas);
    writeFileAtomic(readmePath, registryReadmeContent);

    const ideasMdContent = generateIdeasMd(ideas);
    writeFileAtomic(ideasMdPath, ideasMdContent);

    return NextResponse.json({ success: true, slug, idea }, { status: 200 });
  } catch (error) {
    // Roll back a partial scaffold: if we created the one-shot directory but
    // never committed the registry, remove it so a transient failure leaves no
    // residue in the tracked one-shots/ tree and doesn't permanently block retry
    // via the existsSync guard above. After the registry commit the promotion is
    // durable, so a later doc-regen failure must NOT delete the now-registered
    // one-shot.
    if (createdDir && !registryCommitted && oneShotDir) {
      try {
        fs.rmSync(oneShotDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup; the original error is what matters */
      }
    }
    return NextResponse.json({ error: 'Internal Server Error: ' + error.message }, { status: 500 });
  }
}
