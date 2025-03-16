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
const DOWNLOAD_VIDEOS = config.download_videos;
const BOOK_LANGUAGES = config.book_languages;
const TRANSCRIPT_LANGUAGES = config.transcript_languages;

//Unfortunately transcripts are in a GoogleDrive and the urls are not download friendly try to convert to download urls.
function convertDriveUrl(url) {
  if (!url.includes("drive.google.com")) return url;

  const regex = /\/d\/([a-zA-Z0-9_-]+)/;
  const match = url.match(regex);
  const fileId = match ? match[1] : null;

  if (!fileId) {
    console.warn(`Could not find GoogleDrive file id for ${url} skipping`);
    return url;
  }
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;
}

async function downloadVideo(videos, courseTitle, courseId) {
  if (!DOWNLOAD_VIDEOS) {
    console.warn("Configured not to download videos, skipping.");
  }
  if (!videos || !Array.isArray(videos)) {
    throw new Error("Invalid course downloads data");
  }

  console.log(
    `Total ${videos.length} video files to download for course ${courseTitle}.`
  );

  while (videos.length > 0) {
    const video = videos.shift();

    const videosDir = `downloads/${courseId}_${courseTitle}/videos`.replace(
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
}

async function downloadTranscripts(transcripts, courseTitle, courseId) {
  if (TRANSCRIPT_LANGUAGES.length < 1) {
    console.warn("Configured not to download transcripts, skipping.");
    return;
  }
  if (!transcripts || !Array.isArray(transcripts)) {
    throw new Error("Invalid course downloads data");
  }

  const wantedTranscripts = transcripts
    .map((transcript) => ({
      ...transcript,
      downloads: transcript.downloads.filter(
        (download) =>
          TRANSCRIPT_LANGUAGES.some((language) =>
            download.language.includes(language)
          ) && download.url !== null
      ),
    }))
    .filter((transcript) => transcript.downloads.length > 0);

  if (wantedTranscripts.length < 1) {
    console.warn("None of the transcript languages you configured were found.");
    return;
  }

  console.log(
    `Total ${wantedTranscripts.length} transcript file to download for course ${courseTitle}.`
  );

  const transcriptDir =
    `downloads/${courseId}_${courseTitle}/transcripts`.replace(/[\s:]+/g, "_");

  if (!fs.existsSync(transcriptDir)) {
    fs.mkdirSync(transcriptDir, { recursive: true });
  }

  while (wantedTranscripts.length > 0) {
    const transcript = wantedTranscripts.shift();
    const { title, lesson_id: lessonId, downloads } = transcript;

    while (downloads.length > 0) {
      const download = downloads.shift();
      const { language } = download;
      const url = convertDriveUrl(download.url);

      const filename = `${lessonId.padStart(2, "0")}_${title.replace(
        /\s+/g,
        "_"
      )}_${language}.pdf`; //Guessing that all are pdfs since we dont get file extension when downloading from drive.
      const filePath = path.join(transcriptDir, filename);
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
  }
}

async function downloadBooks(books, courseTitle, courseId) {
  if (BOOK_LANGUAGES.length < 1) {
    console.warn("Configured not to download books, skipping.");
  }
  if (!books || !Array.isArray(books)) {
    throw new Error("Invalid course downloads data");
  }

  const wantedBooks = books.filter(
    (book) =>
      BOOK_LANGUAGES.some((language) => book.title.includes(language)) &&
      book.url !== null
  );

  console.log(
    `Total ${wantedBooks.length} book files to download for course ${courseTitle}.`
  );

  while (wantedBooks.length > 0) {
    const book = wantedBooks.shift();

    const bookDir = `downloads/${courseId}_${courseTitle}/books`.replace(
      /[\s:]+/g,
      "_"
    );

    if (!fs.existsSync(bookDir)) {
      fs.mkdirSync(bookDir, { recursive: true });
    }
    const { title } = book;
    const url = convertDriveUrl(book.url);

    const filename = `${title.replace(/\s+/g, "_")}_book.pdf`;
    const filePath = path.join(bookDir, filename);

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
}

async function fetchData(courseId) {
  try {
    const baseDownloadsUrl =
      "https://tools.nptel.ac.in/npteldata/downloads.php";
    const courseDownloadsUrl = `${baseDownloadsUrl}?id=${courseId}`;
    const response = await axios.get(courseDownloadsUrl);
    const {
      course_downloads: videos,
      transcripts,
      audio,
      books,
      assignments,
      title: courseTitle,
      course_id: responseCourseId,
    } = response.data.data;

    await downloadVideo(videos, courseTitle, responseCourseId);
    await downloadTranscripts(transcripts, courseTitle, responseCourseId);
    await downloadBooks(books, courseTitle, responseCourseId);

    console.log("All downloads completed!");
  } catch (error) {
    console.error("Error fetching data:", error.message);
  }
}

for (const courseId of COURSE_IDS_TO_DOWNLOAD) {
  console.log(`Processing course id: ${courseId}`);
  await fetchData(courseId);
}
