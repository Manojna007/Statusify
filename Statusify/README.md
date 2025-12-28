# Statusify - WhatsApp Status Trimmer

## Overview
Statusify is a web application designed to help users trim their WhatsApp status videos into perfect 1-minute chunks. The application allows users to upload videos, preview them, and manage their chunks efficiently.

## Features
- Upload video files in various formats (MP4, WebM, Ogg).
- Preview uploaded videos.
- Select and manage video chunks.
- Download chunks in MP4 format.
- Auto-split videos into 1-minute chunks.
- Manual chunking with the ability to add selected regions to the queue.

## Project Structure
```
Statusify
├── WhatsApp Status Trimmer.html      # Main HTML file for the application
├── src
│   ├── js
│   │   └── app.js                    # JavaScript logic for handling video uploads, previews, and chunk management
│   └── css
│       └── styles.css                # CSS styles for the application
├── package.json                       # npm configuration file
└── README.md                          # Documentation for the project
```

## Setup Instructions
1. Clone the repository:
   ```
   git clone <repository-url>
   cd Statusify
   ```

2. Open the `WhatsApp Status Trimmer.html` file in a web browser to run the application.

3. Ensure you have a modern web browser that supports HTML5 video playback and the MediaRecorder API for chunk downloading.

## Usage Guidelines
- To upload a video, click on the upload area or drag and drop a video file.
- After uploading, you can preview the video and select the desired chunk.
- Use the timeline editor to adjust the start and end times for manual chunking.
- Click "Add to Queue" to create a chunk based on the current selection.
- Click on a chunk and then "Preview" to view that specific chunk.
- Download the chunks in MP4 format by clicking the download button next to each chunk.

## Contributing
Contributions are welcome! Please feel free to submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.