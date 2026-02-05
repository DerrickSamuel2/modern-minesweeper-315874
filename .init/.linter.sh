#!/bin/bash
cd /home/kavia/workspace/code-generation/modern-minesweeper-315874/minesweeper_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

