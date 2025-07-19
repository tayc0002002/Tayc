const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const { execSync } = require('child_process');
const obfuscator = require('javascript-obfuscator');

const REPO = 'https://github.com/Warano02/f2bot.git';
const TEMP_DIR = '.temp_clone';
const ROOT = process.cwd();

const KEEP = ['Tayc.js', 'package.json', 'node_modules', '.env'];

function run(cmd, cwd = process.cwd(), silent = false) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: silent ? 'ignore' : 'inherit', cwd });
}

function obfuscateAllJS(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            obfuscateAllJS(fullPath);
        } else if (file.endsWith('.js')) {
            const code = fs.readFileSync(fullPath, 'utf8');
            const obfuscated = obfuscator.obfuscate(code, {
                compact: true,
                controlFlowFlattening: true,
                deadCodeInjection: true,
                stringArray: true,
                rotateStringArray: true,
                stringArrayThreshold: 0.75,
            }).getObfuscatedCode();
            fs.writeFileSync(fullPath, obfuscated);
            console.log(`🔐 Obfuscated: ${fullPath}`);
        }
    }
}

function mergePackageJsons(tempPath) {
    const basePkg = require('./package.json');
    const targetPkgPath = path.join(tempPath, 'package.json');
    const targetPkg = require(targetPkgPath);

    const mergedPkg = {
        ...targetPkg,
        dependencies: {
            ...(targetPkg.dependencies || {}),
            ...(basePkg.dependencies || {}),
        },
        scripts: {
            start: targetPkg.scripts?.start || 'node index.js',
        },
    };

    fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(mergedPkg, null, 2));
    console.log('✅ package.json merged and saved to root');
}

function cleanRootExcept(keepList) {
    fs.readdirSync(ROOT).forEach(file => {
        if (!keepList.includes(file)) {
            const fullPath = path.join(ROOT, file);
            try {
                fse.removeSync(fullPath);
                console.log(`🗑️ Removed: ${file}`);
            } catch (err) {
                console.warn(`⚠️ Failed to remove ${file}: ${err.message}`);
            }
        }
    });
}

// 🧠 Main async block
(async () => {
    console.log('\n📥 Cloning f2bot repository...');
    run(`git clone ${REPO} ${TEMP_DIR}`, process.cwd(), true); // silent=true

    console.log('\n🔐 Obfuscating JavaScript files...');
    obfuscateAllJS(TEMP_DIR);

    console.log('\n📦 Copying cloned files to project root...');
    fse.copySync(TEMP_DIR, ROOT, { overwrite: true });

    console.log('\n🧹 Cleaning project root (excluding .env, Tayc.js, etc.)...');
    cleanRootExcept(KEEP);

    console.log('\n📦 Merging package.json...');
    mergePackageJsons(TEMP_DIR);

    console.log('\n🧾 Checking for .env file...');
    const envPath = path.join(ROOT, '.env');
    if (!fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, `# Bot configuration
# Example:
# SESSION_ID=your_session_id_here
# API_KEY=your_api_key_here
`);
        console.log('📝 .env file created (empty). Please fill it before starting the bot.');
    } else {
        console.log('✅ .env file already exists. Skipping creation.');
    }

    console.log('\n🗑️ Removing temporary clone directory...');
    fse.removeSync(TEMP_DIR);

    console.log('\n📦 Installing dependencies...');
    run('npm install');

    console.log('\n🚀 All done!');
    console.log('👉 To start the bot: npm start\n');
})();
