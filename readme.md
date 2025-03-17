**What**  
Downloader for courses from https://nptel.ac.in/courses/  
Can download multiple courses and multiple languages.  
Will currently download:  
* Video  
* Transcript  
* Books 

Working on:
* Audio
* Assignments

**How to use:**  
You need to have https://nodejs.org/ installed.  
1. Clone the repo  
:warning: Edit config.json to include the courses and languages you want to download.

2. Install dependencies:  
``` 
npm i  
```

3. To start the downloads run:  
```
node index.js
```

A downloads folder will be created in the project folder where all files will be saved each under the course name.

**Possible improvements:**  
* Currently downloads 1 file at a time, some parallelism would be faster, ran into some reliability issues trying to implement that. So just relax and let it download, maybe go for a :walking: 
* Doesn't attempt to do any cleanup or resume.
* File might be corrupt if download is interrupted in the middle.
* Want to add a mode to just save the links to a text file so you can use a proper download manager such as JDownloader.org to do the actual downloads with parallel downloads, resume etc.