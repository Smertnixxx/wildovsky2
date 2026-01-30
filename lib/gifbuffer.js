const fs = require('fs').promises;
const { spawn } = require('child_process');
const path = require('path');

const GIFBufferToVideoBuffer = async (image) => {
  try {
    const filename = `${Math.random().toString(36).substring(2)}`;
    const tmpDir = path.join(process.cwd(), 'tmp');
    
    // Ensure tmp directory exists
    try {
      await fs.access(tmpDir);
    } catch {
      await fs.mkdir(tmpDir, { recursive: true });
    }

    const gifFilePath = path.join(tmpDir, `${filename}.gif`);
    const mp4FilePath = path.join(tmpDir, `${filename}.mp4`);

    await fs.writeFile(gifFilePath, image);

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn(
        'ffmpeg',
        [
          '-i', gifFilePath,
          '-movflags', 'faststart',
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-y', // Overwrite output file if exists
          mp4FilePath,
        ],
        {
          stdio: 'ignore',
          shell: false,
          windowsHide: true,
        }
      );

      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg завершился с кодом ${code}`));
      });

      ffmpeg.on('error', reject);
    });

    const videoBuffer = await fs.readFile(mp4FilePath);

    // Clean up files
    await Promise.all([
      fs.unlink(gifFilePath).catch(() => {}),
      fs.unlink(mp4FilePath).catch(() => {})
    ]);

    return videoBuffer;
  } catch (error) {
    console.error('Error processing GIF to video:', error);
    throw new Error('Error processing GIF to video.');
  }
};

module.exports = GIFBufferToVideoBuffer;