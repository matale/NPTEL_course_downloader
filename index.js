import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { promisify } from "util";
import stream from "stream";
import { parse } from "comment-json";

const pipeline = promisify(stream.pipeline);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = path.join(__dirname, "config.json");

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error("Config file not found! Make sure config.json exists.");
  }

  let config;
  try {
    config = parse(fs.readFileSync(configPath, "utf-8"));
  } catch (error) {
    throw new Error("Invalid JSON format in config.json.");
  }

  validateConfig(config);
  return config;
}

function validateConfig(config) {
  const schema = {
    course_ids_to_download: "array",
    transcript_languages: "array",
    book_languages: "array",
    audio_languages: "array",
    download_assignments: "boolean",
    download_videos: "boolean",
  };

  for (const key in schema) {
    if (!(key in config)) {
      throw new Error(`Missing required config key: ${key}`);
    }
    if (schema[key] == "array") {
      if (
        !(
          Array.isArray(config[key]) &&
          config[key].every((item) => typeof item === "string")
        )
      ) {
        throw new Error(`Invalid type for ${key}. Expected: array of strings.`);
      }
    } else if (typeof config[key] !== schema[key]) {
      throw new Error(
        `Invalid type for ${key}. Expected: ${schema[key]} Found: ${config[key]}`
      );
    }
  }
  if (config.course_ids_to_download.length < 1) {
    throw new Error("Must provide at least 1 course id to download.");
  }
}

const config = loadConfig();
console.log("Config loaded successfully:", config);

// Accessing config values
const COURSE_IDS_TO_DOWNLOAD = config.course_ids_to_download;
const TRANSCRIPT_LANGUAGES = config.transcript_languages;

async function downloadVideo(video, course_title, course_id) {
  const videosDir = `downloads/${course_id}_${course_title}/videos`.replace(
    /[\s:]+/g,
    "_"
  );

  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }
  const { title, url, lesson_id } = video;
  const filename = `${lesson_id.padStart(2, "0")}_${title.replace(
    /\s+/g,
    "_"
  )}_${path.basename(url)}`;
  const filePath = path.join(videosDir, filename);

  try {
    console.log(`Start downloading: ${filename}`);
    const response = await axios({
      method: "get",
      url,
      responseType: "stream",
    });

    await pipeline(response.data, fs.createWriteStream(filePath));
    console.log(`Downloaded: ${filename}`);
  } catch (error) {
    console.error(`Error downloading ${filename}:`, error.message);
  }
}

async function fetchData(courseId) {
  try {
    const baseDownloadsUrl =
      "https://tools.nptel.ac.in/npteldata/downloads.php";
    const courseDownloadsUrl = `${baseDownloadsUrl}?id=${courseId}`;
    const response = await axios.get(courseDownloadsUrl);
    const {
      course_downloads: courseDownloads,
      title: courseTitle,
      course_id: responseCourseId,
    } = response.data.data;

    if (!courseDownloads || !Array.isArray(courseDownloads)) {
      throw new Error("Invalid course downloads data");
    }

    const queue = [...courseDownloads];
    console.log(
      `Total ${queue.length} video files to download for course ${courseTitle}.`
    );

    while (queue.length > 0) {
      await downloadVideo(queue.shift(), courseTitle, responseCourseId);
    }

    console.log("All downloads completed!");
  } catch (error) {
    console.error("Error fetching data:", error.message);
  }
}

for (const courseId of COURSE_IDS_TO_DOWNLOAD) {
  console.log(`Processing course id: ${courseId}`);
  await fetchData(courseId);
}
