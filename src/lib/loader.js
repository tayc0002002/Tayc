const fs = require('fs')
const path = require('path')
const chalk = require('chalk')

const COMMANDS = []

function loadCommands(dir = path.join(__dirname)) {
  COMMANDS.length = 0
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const fullPath = path.join(dir, file)
    if (!file.endsWith('.js') || fs.statSync(fullPath).isDirectory()) continue
    try {
      delete require.cache[require.resolve(fullPath)]
      const cmds = require(fullPath)
      if (Array.isArray(cmds)) {
        cmds.forEach(cmd => (cmd.__source = fullPath))
        COMMANDS.push(...cmds)
        console.log(chalk.green(`[LOADED] ${file}`))
      }
    } catch (e) {
      console.log(chalk.red(`[ERROR] Loading ${file}: ${e.message}`))
    }
  }
}

function watchCommands(dir = path.join(__dirname)) {
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const fullPath = path.join(dir, file)
    if (!file.endsWith('.js') || fs.statSync(fullPath).isDirectory()) continue

    fs.watchFile(fullPath, () => {
      console.log(chalk.cyan(`🔁 File updated: ${file}`))
      for (let i = COMMANDS.length - 1; i >= 0; i--) {
        if (COMMANDS[i].__source === fullPath) COMMANDS.splice(i, 1)
      }
      try {
        delete require.cache[require.resolve(fullPath)]
        const updated = require(fullPath)
        if (Array.isArray(updated)) {
          updated.forEach(cmd => (cmd.__source = fullPath))
          COMMANDS.push(...updated)
          console.log(chalk.green(`✅ Reloaded: ${file}`))
        } else {
          console.log(chalk.yellow(`⚠️ Not an array in: ${file}`))
        }
      } catch (err) {
        console.log(chalk.red(`❌ Reload error in ${file}: ${err.message}`))
      }
    })
  }
}

module.exports = {
  COMMANDS,
  loadCommands,
  watchCommands
}
