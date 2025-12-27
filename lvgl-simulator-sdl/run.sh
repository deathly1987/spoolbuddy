#!/bin/bash
# Run SpoolBuddy LVGL Simulator
cd "$(dirname "$0")"

# Force software rendering (no OpenGL/GLX required)
export SDL_RENDER_DRIVER=software
export SDL_VIDEODRIVER=x11
export SDL_VIDEO_X11_VISUALID=
export LIBGL_ALWAYS_SOFTWARE=1

./build/simulator
