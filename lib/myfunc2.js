const axios = require("axios");
const cheerio = require("cheerio");
const { resolve } = require("path");
const util = require("util");
let BodyForm = require('form-data');
let { fromBuffer } = require('file-type');
const fs = require('fs'); // pour readStream, writeFileSync, existsSync
const fsp = require('fs/promises'); // pour toutes les fonctions async await
const child_process = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const chalk = require("chalk");

const { unlink } = fsp;

exports.sleep = async (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.fetchJson = async (url, options = {}) => {
	try {
		const res = await axios({
			method: 'GET',
			url,
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/95.0.4638.69 Safari/537.36'
			},
			...options
		});
		return res.data;
	} catch (err) {
		return err;
	}
};

exports.fetchBuffer = async (url, options = {}) => {
	try {
		const res = await axios({
			method: "GET",
			url,
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
				'DNT': 1,
				'Upgrade-Insecure-Request': 1
			},
			...options,
			responseType: 'arraybuffer'
		});
		return res.data;
	} catch (err) {
		return err;
	}
};

exports.webp2mp4File = async (filePath) => {
	return new Promise((resolve, reject) => {
		const form = new BodyForm();
		form.append('new-image-url', '');
		form.append('new-image', fs.createReadStream(filePath));
		axios({
			method: 'post',
			url: 'https://s6.ezgif.com/webp-to-mp4',
			data: form,
			headers: form.getHeaders()
		}).then(({ data }) => {
			const $ = cheerio.load(data);
			const file = $('input[name="file"]').attr('value');
			const secondForm = new BodyForm();
			secondForm.append('file', file);
			secondForm.append('convert', "Convert WebP to MP4!");
			axios({
				method: 'post',
				url: 'https://ezgif.com/webp-to-mp4/' + file,
				data: secondForm,
				headers: secondForm.getHeaders()
			}).then(({ data }) => {
				const $ = cheerio.load(data);
				const result = 'https:' + $('div#output > p.outfile > video > source').attr('src');
				resolve({ status: true, result });
			}).catch(reject);
		}).catch(reject);
	});
};

exports.fetchUrl = exports.fetchJson;

exports.WAVersion = async () => {
	const data = await exports.fetchUrl("https://web.whatsapp.com/check-update?version=1&platform=web");
	return [data.currentVersion.replace(/[.]/g, ", ")];
};

exports.getRandom = (ext) => `${Math.floor(Math.random() * 10000)}${ext}`;

exports.isUrl = (url) => {
	return /^https?:\/\/[^\s$.?#].[^\s]*$/gm.test(url);
};

exports.isNumber = (number) => {
	const int = parseInt(number);
	return typeof int === 'number' && !isNaN(int);
};

exports.TelegraPh = (Path) => {
	return new Promise(async (resolve, reject) => {
		if (!fs.existsSync(Path)) return reject(new Error("File not Found"));
		try {
			const form = new BodyForm();
			form.append("file", fs.createReadStream(Path));
			const { data } = await axios({
				url: "https://telegra.ph/upload",
				method: "POST",
				headers: form.getHeaders(),
				data: form
			});
			resolve("https://telegra.ph" + data[0].src);
		} catch (err) {
			reject(new Error(String(err)));
		}
	});
};

exports.buffergif = async (image) => {
	const filename = `${Math.random().toString(36)}`;
	await fsp.writeFile(`./XeonMedia/trash/${filename}.gif`, image);
	child_process.exec(
		`ffmpeg -i ./XeonMedia/trash/${filename}.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" ./XeonMedia/trash/${filename}.mp4`
	);
	await exports.sleep(4000);
	const buffer = await fsp.readFile(`./XeonMedia/trash/${filename}.mp4`);
	await Promise.all([
		unlink(`./XeonMedia/trash/${filename}.gif`),
		unlink(`./XeonMedia/trash/${filename}.mp4`)
	]);
	return buffer;
};

async function deletePathAsync(filePath) {
	try {
		const stat = await fsp.stat(filePath);
		if (stat.isDirectory()) {
			await fsp.rm(filePath, { recursive: true, force: true });
		} else {
			await fsp.unlink(filePath);
		}
		return true;
	} catch (err) {
		console.error(`❌ Error deleting ${filePath}:`, err.message);
		return false;
	}
}

async function clearDirectory(dirPath) {
	try {
		const exists = await fsp.access(dirPath).then(() => true).catch(() => false);
		if (!exists) {
			return { success: false, message: `Directory does not exist: ${dirPath}` };
		}
		const items = await fsp.readdir(dirPath);
		let deletedCount = 0;
		for (const item of items) {
			const fullPath = path.join(dirPath, item);
			if (await deletePathAsync(fullPath)) deletedCount++;
		}
		return {
			success: true,
			message: `✅ Cleared ${deletedCount} item(s) in ${path.basename(dirPath)}`,
			count: deletedCount
		};
	} catch (error) {
		console.error(`❌ Error clearing ${dirPath}:`, error.message);
		return {
			success: false,
			message: `❌ Failed to clear ${path.basename(dirPath)}`,
			error: error.message
		};
	}
}

async function clearTmpDirectory() {
	console.log(chalk.red("[TAYC-FAN] Clearing temporary directories..."));
	const tmpDir = path.join(process.cwd(), 'tmp');
	const tempDir = path.join(process.cwd(), 'temp');

	const results = await Promise.all([
		clearDirectory(tmpDir),
		clearDirectory(tempDir)
	]);

	const success = results.every(r => r.success);
	const totalDeleted = results.reduce((sum, r) => sum + (r.count || 0), 0);
	const message = results.map(r => r.message).join(' | ');

	console.log(chalk.green(`[TAYC-FAN] ${message}`));
	return { success, message, count: totalDeleted };
}

function startAutoClear(intervalMs = 6 * 60 * 60 * 1000) {
	clearTmpDirectory().then(result => {
		if (!result.success) console.error(`[Auto Clear] ${result.message}`);
	});
	setInterval(async () => {
		const result = await clearTmpDirectory();
		if (!result.success) console.error(`[Auto Clear] ${result.message}`);
	}, intervalMs);
}

exports.deletePathAsync = deletePathAsync;
exports.clearDirectory = clearDirectory;
exports.clearTmpDirectory = clearTmpDirectory;
exports.startAutoClear = startAutoClear;
