cmake_minimum_required(VERSION 3.14)
project(spoolbuddy_simulator C)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Disable LVGL examples and demos (not needed for simulator)
set(LV_CONF_BUILD_DISABLE_EXAMPLES ON CACHE BOOL "" FORCE)
set(LV_CONF_BUILD_DISABLE_DEMOS ON CACHE BOOL "" FORCE)

# Find SDL2 - handle macOS Homebrew and Linux
if(APPLE)
    # macOS with Homebrew
    execute_process(
        COMMAND brew --prefix sdl2
        OUTPUT_VARIABLE SDL2_PREFIX
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
    set(SDL2_INCLUDE_DIRS "${SDL2_PREFIX}/include")
    set(SDL2_LIBRARIES "-L${SDL2_PREFIX}/lib -lSDL2")
else()
    # Linux - use pkg-config
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(SDL2 REQUIRED sdl2)
endif()

# LVGL configuration
set(LV_CONF_PATH "${CMAKE_CURRENT_SOURCE_DIR}/lv_conf.h" CACHE STRING "" FORCE)
add_compile_definitions(LV_CONF_INCLUDE_SIMPLE)
add_compile_definitions(LV_LVGL_H_INCLUDE_SIMPLE)

# LVGL library
add_subdirectory(lvgl)

# Collect UI source files
file(GLOB UI_SOURCES "ui/*.c")

# Main executable
add_executable(simulator
    main.c
    ${UI_SOURCES}
)

target_include_directories(simulator PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/ui
    ${CMAKE_CURRENT_SOURCE_DIR}/lvgl
    ${SDL2_INCLUDE_DIRS}
)

target_link_libraries(simulator
    lvgl
    ${SDL2_LIBRARIES}
    m
    pthread
)

# Suppress warnings from generated code
target_compile_options(simulator PRIVATE -w)
