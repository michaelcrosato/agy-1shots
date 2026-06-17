#!/usr/bin/env python3
import os
import sys
import json
import re
import platform
import datetime
import argparse

def get_slug(title):
    title_lower = title.lower().strip()
    if title_lower == "notion scraper":
        return "notion-scraper"
    
    parts = re.split(r'[,:]', title)
    primary_part = parts[0].strip()
    
    slug = re.sub(r'[^a-z0-9]+', '-', primary_part.lower())
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    return slug

def generate_ideas_readme(ideas):
    categories = [
        "Automotive & B2B Lead Generation Tools",
        "AI Development, Prompting, Routing & Evaluation Tools",
        "Agent Orchestration, Governance & Sandbox Frameworks",
        "Codebase Engineering & Git Workflow Enhancers",
        "Data, Document & Workspace Productivity Tools",
        "Micro-SaaS Templates & Personal Workflow Apps"
    ]
    
    md = "# One-Shot Ideas Registry\n\n"
    md += "Welcome to the One-Shot Ideas Registry. This repository stores, categories, and indexes ideas for standalone utilities, bots, and Micro-SaaS tools that can be generated in \"one-shot\" by developer agents.\n\n"
    md += "## Registry Statistics\n"
    md += f"- **Total Ideas**: {len(ideas)}\n"
    md += "- **Categories**: 6 major technical domains\n\n"
    md += "---\n\n"
    md += "## Ideas by Category\n\n"
    
    for category in categories:
        cat_ideas = [i for i in ideas if i.get("category") == category]
        md += f"### {category}\n\n"
        md += "| ID | Title | Target Stack | Date Added |\n"
        md += "| :--- | :--- | :--- | :--- |\n"
        for idea in cat_ideas:
            md += f"| `{idea['id']}` | [{idea['title']}](#{idea['id']}) | `{idea['targetStack']}` | {idea['dateAdded']} |\n"
        md += "\n"
        
    md += "---\n\n## Detailed Idea Specs\n\n"
    
    for idea in ideas:
        md += f"### <a name=\"{idea['id']}\"></a> {idea['title']}\n\n"
        md += f"- **ID**: `{idea['id']}`\n"
        md += f"- **Category**: {idea['category']}\n"
        md += f"- **Target Stack**: `{idea['targetStack']}`\n"
        md += f"- **Date Added**: {idea['dateAdded']}\n"
        
        status = idea.get("status", "backlog")
        promoted_to = idea.get("promoted_to")
        supersedes = idea.get("supersedes")
        
        md += f"- **Status**: `{status}`\n"
        
        if promoted_to is not None:
            md += f"- **Promoted To**: {promoted_to}\n"
        else:
            md += "- **Promoted To**: null\n"
            
        if supersedes is not None:
            md += f"- **Supersedes**: {supersedes}\n"
        else:
            md += "- **Supersedes**: null\n"
            
        md += "\n"
        md += f"#### Core Vision\n{idea['vision']}\n\n"
        md += f"#### Technical Specifications\n{idea['techSpecs']}\n\n"
        md += f"#### Standardized Task Prompt\n```text\n{idea['readyToCopyTaskPrompt']}\n```\n\n"
        md += "---\n\n"
        
    return md

def generate_ideas_md(ideas):
    categories = [
        "Automotive & B2B Lead Generation Tools",
        "AI Development, Prompting, Routing & Evaluation Tools",
        "Agent Orchestration, Governance & Sandbox Frameworks",
        "Codebase Engineering & Git Workflow Enhancers",
        "Data, Document & Workspace Productivity Tools",
        "Micro-SaaS Templates & Personal Workflow Apps"
    ]
    
    promoted_ideas = [i for i in ideas if i.get("status") == "promoted"]
    promoted_titles = [i["title"] for i in promoted_ideas]
    promoted_str = f" ({', '.join(promoted_titles)})" if promoted_titles else ""
    backlog_count = len([i for i in ideas if i.get("status") == "backlog"])
    
    md = "# One-Shot Ideas Backlog\n\n"
    md += "This document lists all ideas available in the registry, including their current lifecycle status.\n\n"
    md += "## Backlog Statistics\n"
    md += f"- **Stats**: {len(ideas)} total ideas, {len(promoted_ideas)} promoted{promoted_str}\n"
    md += f"- **Backlog Ideas**: {backlog_count}\n\n"
    md += "---\n\n"
    md += "## Category Summary\n\n"
    
    for category in categories:
        cat_ideas = [i for i in ideas if i.get("category") == category]
        md += f"### {category}\n\n"
        md += "| ID | Title | Target Stack | Status | Promoted To |\n"
        md += "| :--- | :--- | :--- | :--- | :--- |\n"
        for idea in cat_ideas:
            status = idea.get("status", "backlog")
            promoted_to = idea.get("promoted_to")
            
            if status == "promoted" and promoted_to:
                promoted_to_val = f"`{promoted_to}`"
            else:
                promoted_to_val = "-"
                
            md += f"| `{idea['id']}` | [{idea['title']}](#{idea['id']}) | `{idea['targetStack']}` | `{status}` | {promoted_to_val} |\n"
        md += "\n"
        
    md += "---\n\n## Backlog Details\n\n"
    
    for idea in ideas:
        md += f"### <a name=\"{idea['id']}\"></a> {idea['title']}\n\n"
        md += f"- **ID**: `{idea['id']}`\n"
        md += f"- **Category**: {idea['category']}\n"
        md += f"- **Target Stack**: `{idea['targetStack']}`\n"
        
        status = idea.get("status", "backlog")
        md += f"- **Status**: `{status}`\n"
        
        if status == "promoted" and idea.get("promoted_to"):
            md += f"- **Promoted To**: `one-shots/{idea['promoted_to']}/`\n"
            
        md += f"- **Date Added**: {idea['dateAdded']}\n\n"
        md += f"#### Vision\n{idea['vision']}\n\n"
        md += f"#### Technical Specifications\n{idea['techSpecs']}\n\n"
        md += f"#### Task Prompt\n```text\n{idea['readyToCopyTaskPrompt']}\n```\n\n"
        md += "---\n\n"
        
    return md

def main():
    parser = argparse.ArgumentParser(description="Promote an idea to a scaffolded one-shot project.")
    parser.add_argument("id", help="The prefix ID of the idea to promote (e.g. AUTO-001)")
    args = parser.parse_args()
    
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    registry_path = os.path.join(repo_root, "ideas", "registry.json")
    readme_path = os.path.join(repo_root, "ideas", "README.md")
    ideas_md_path = os.path.join(repo_root, "IDEAS.md")
    
    if not os.path.exists(registry_path):
        print(f"Error: Registry file not found at {registry_path}", file=sys.stderr)
        sys.exit(1)
        
    with open(registry_path, "r", encoding="utf-8") as f:
        ideas = json.load(f)
        
    idea = None
    for item in ideas:
        if item.get("id") == args.id:
            idea = item
            break
            
    if not idea:
        print(f"Error: Idea with ID {args.id} not found in registry.", file=sys.stderr)
        sys.exit(1)
        
    # If already promoted
    if idea.get("status") == "promoted":
        print(f"Idea {args.id} is already promoted. Regenerating markdown files just in case...")
        # Regenerate markdown files
        readme_content = generate_ideas_readme(ideas)
        with open(readme_path, "w", encoding="utf-8") as f:
            f.write(readme_content)
        ideas_md_content = generate_ideas_md(ideas)
        with open(ideas_md_path, "w", encoding="utf-8") as f:
            f.write(ideas_md_content)
        sys.exit(0)
        
    slug = get_slug(idea["title"])
    one_shot_dir = os.path.join(repo_root, "one-shots", slug)
    os.makedirs(one_shot_dir, exist_ok=True)
    
    # 1. Create oneshot.json
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    oneshot_data = {
        "schemaVersion": 1,
        "spec": {
            "vision": idea["vision"],
            "createdAt": now_iso,
            "acceptance": {
                "mode": "program",
                "script": "verify",
                "successExitCode": 0
            }
        },
        "attempts": [
            {
                "id": "att_seed",
                "timestamp": now_iso,
                "model": "Gemini 3.5 Flash",
                "environment": {
                    "tool": "OneShotForge CLI",
                    "toolBuild": "1.0.0",
                    "os": platform.system(),
                    "osBuild": platform.release()
                },
                "build": {
                    "tokens": None,
                    "durationMs": None
                },
                "runtime": {
                    "tokens": None,
                    "durationMs": None
                },
                "evaluation": {
                    "method": "none",
                    "fidelityScore": None,
                    "passed": None,
                    "feedback": "",
                    "evaluatedAt": None
                }
            }
        ]
    }
    
    oneshot_path = os.path.join(one_shot_dir, "oneshot.json")
    with open(oneshot_path, "w", encoding="utf-8") as f:
        json.dump(oneshot_data, f, indent=2)
        
    # 2. Determine target stack and choose main/verify file types
    stack = idea.get("targetStack", "")
    stack_lower = stack.lower()
    
    if "python" in stack_lower:
        main_filename = "main.py"
        main_content = 'print("Hello from OneShotForge!")\n'
        verify_filename = "verify.py"
        verify_content = 'import sys\nprint("Verification passed!")\nsys.exit(0)\n'
        start_cmd = "python main.py"
        test_cmd = "python verify.py"
        verify_cmd = "python verify.py"
    elif "rust" in stack_lower:
        main_filename = "src/main.rs"
        main_content = 'fn main() {\n    println!("Hello from OneShotForge!");\n}\n'
        verify_filename = "verify.py"
        verify_content = 'import sys\nprint("Verification passed!")\nsys.exit(0)\n'
        start_cmd = "cargo run"
        test_cmd = "cargo test"
        verify_cmd = "python verify.py"
    elif any(kw in stack_lower for kw in ["node", "js", "react"]):
        main_filename = "index.js"
        main_content = 'console.log("Hello from OneShotForge!");\n'
        verify_filename = "verify.js"
        verify_content = 'console.log("Verification passed!");\nprocess.exit(0);\n'
        start_cmd = "node index.js"
        test_cmd = "node verify.js"
        verify_cmd = "node verify.js"
    else:  # Default to Python
        main_filename = "main.py"
        main_content = 'print("Hello from OneShotForge!")\n'
        verify_filename = "verify.py"
        verify_content = 'import sys\nprint("Verification passed!")\nsys.exit(0)\n'
        start_cmd = "python main.py"
        test_cmd = "python verify.py"
        verify_cmd = "python verify.py"
        
    # 3. Create package.json
    tags = [t.strip().lower() for t in re.split(r',|\bor\b', stack, flags=re.IGNORECASE) if t.strip()]
    seen_tags = set()
    deduped_tags = []
    for t in tags:
        if t not in seen_tags:
            seen_tags.add(t)
            deduped_tags.append(t)
            
    package_data = {
        "name": slug,
        "version": "1.0.0",
        "description": idea["vision"],
        "main": main_filename.replace("src/", ""),
        "scripts": {
            "start": start_cmd,
            "test": test_cmd,
            "verify": verify_cmd
        },
        "tags": deduped_tags
    }
    
    package_path = os.path.join(one_shot_dir, "package.json")
    with open(package_path, "w", encoding="utf-8") as f:
        json.dump(package_data, f, indent=2)
        
    # 4. Create main source file
    main_path = os.path.join(one_shot_dir, main_filename)
    os.makedirs(os.path.dirname(main_path), exist_ok=True)
    with open(main_path, "w", encoding="utf-8") as f:
        f.write(main_content)
        
    # 5. Create verify script
    verify_path = os.path.join(one_shot_dir, verify_filename)
    with open(verify_path, "w", encoding="utf-8") as f:
        f.write(verify_content)
        
    # 6. Create local README.md
    readme_local_content = f"""# {idea['title']}

## Vision
{idea['vision']}

## Technical Specifications
{idea['techSpecs']}

## Target Stack
{stack}

## Standardized Task Prompt
```text
{idea['readyToCopyTaskPrompt']}
```

## Setup & Run Instructions
1. Setup your environment and dependencies.
2. Run the start command:
   ```bash
   {start_cmd}
   ```
3. Run tests or verify the script:
   ```bash
   {test_cmd}
   ```
"""
    readme_local_path = os.path.join(one_shot_dir, "README.md")
    with open(readme_local_path, "w", encoding="utf-8") as f:
        f.write(readme_local_content)
        
    # 7. Update ideas/registry.json
    idea["status"] = "promoted"
    idea["promoted_to"] = slug
    
    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(ideas, f, indent=2)
        
    # 8. Regenerate markdown files
    readme_content = generate_ideas_readme(ideas)
    with open(readme_path, "w", encoding="utf-8") as f:
        f.write(readme_content)
        
    ideas_md_content = generate_ideas_md(ideas)
    with open(ideas_md_path, "w", encoding="utf-8") as f:
        f.write(ideas_md_content)
        
    print(f"Successfully promoted idea {args.id} to /one-shots/{slug}/")

if __name__ == "__main__":
    main()
