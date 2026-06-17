#!/usr/bin/env python3
import os
import sys
import json
import re
import platform
import subprocess

def copy_to_clipboard(text):
    system = platform.system().lower()
    try:
        if "windows" in system:
            subprocess.run("clip", input=text, text=True, shell=True, check=True)
        elif "darwin" in system:
            subprocess.run("pbcopy", input=text, text=True, check=True)
        else:
            try:
                subprocess.run(["xclip", "-selection", "clipboard"], input=text, text=True, check=True)
            except FileNotFoundError:
                subprocess.run(["xsel", "--clipboard", "--input"], input=text, text=True, check=True)
        print("\n[Copied compiled prompt to clipboard successfully!]", file=sys.stderr)
    except Exception as e:
        print(f"\n[Warning: Clipboard copy failed: {e}]", file=sys.stderr)

def main():
    args = sys.argv[1:]
    if not args:
        print("Error: Idea ID is required.", file=sys.stderr)
        print("Usage: python prompt-gen.py <ID> [--<var_name> <value>] [--clipboard]", file=sys.stderr)
        sys.exit(1)
        
    idea_id = None
    clipboard = False
    overrides = {}
    
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--clipboard":
            clipboard = True
            i += 1
        elif arg.startswith("--"):
            var_name = arg[2:]
            if i + 1 < len(args):
                val = args[i+1]
                overrides[var_name.lower()] = val
                i += 2
            else:
                print(f"Warning: Flag {arg} has no value provided.", file=sys.stderr)
                i += 1
        else:
            if idea_id is None:
                idea_id = arg
            else:
                print(f"Warning: Extra positional argument ignored: {arg}", file=sys.stderr)
            i += 1
            
    if idea_id is None:
        print("Error: Idea ID is required.", file=sys.stderr)
        sys.exit(1)
        
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    registry_path = os.path.join(repo_root, "ideas", "registry.json")
    
    if not os.path.exists(registry_path):
        print(f"Error: Registry file not found at {registry_path}", file=sys.stderr)
        sys.exit(1)
        
    with open(registry_path, "r", encoding="utf-8") as f:
        ideas = json.load(f)
        
    idea = None
    for item in ideas:
        if item.get("id") == idea_id:
            idea = item
            break
            
    if not idea:
        print(f"Error: Idea with ID {idea_id} not found in registry.", file=sys.stderr)
        sys.exit(1)
        
    prompt = idea.get("readyToCopyTaskPrompt", "")
    target_stack = idea.get("targetStack", "")
    
    # Perform variable substitution on placeholders (e.g. {{LANGUAGE}})
    # Matching double curly braces case-insensitively
    def replace_placeholder(match):
        var_name = match.group(1).strip()
        var_name_lower = var_name.lower()
        
        if var_name_lower in overrides:
            return overrides[var_name_lower]
            
        # Try to determine a default
        if var_name_lower == "language":
            if "python" in target_stack.lower():
                return "Python"
            elif any(kw in target_stack.lower() for kw in ["node", "js", "react"]):
                return "JavaScript"
            elif "rust" in target_stack.lower():
                return "Rust"
            else:
                return "Python"
        elif var_name_lower == "framework":
            if "playwright" in target_stack.lower():
                return "Playwright"
            elif "crawl4ai" in target_stack.lower():
                return "Crawl4AI"
            elif "fastapi" in target_stack.lower():
                return "FastAPI"
            elif "express" in target_stack.lower():
                return "Express"
            elif "next.js" in target_stack.lower():
                return "Next.js"
            else:
                return "Playwright"
        elif var_name_lower in ["database", "db"]:
            if "sqlite" in target_stack.lower():
                return "SQLite"
            elif "postgres" in target_stack.lower():
                return "PostgreSQL"
            else:
                return "SQLite"
                
        return var_name
        
    compiled_prompt = re.sub(r'\{\{([^}]+)\}\}', replace_placeholder, prompt)
    
    # Print the final compiled prompt to stdout
    print(compiled_prompt)
    
    if clipboard:
        copy_to_clipboard(compiled_prompt)

if __name__ == "__main__":
    main()
