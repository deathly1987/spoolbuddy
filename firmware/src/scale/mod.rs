//! Scale module for load cell amplifiers.
//!
//! Supports:
//! - NAU7802 (SparkFun Qwiic Scale) - I2C interface, recommended
//!
//! The NAU7802 is a 24-bit ADC with I2C interface at address 0x2A.
//!
//! Hardware connection via CrowPanel Advance 7.0" I2C-OUT connector:
//! - IO19 (I2C-OUT Pin 2) -> SDA
//! - IO20 (I2C-OUT Pin 3) -> SCL
//! - 3V3  (I2C-OUT Pin 1) -> VCC
//! - GND  (I2C-OUT Pin 4) -> GND

#![allow(dead_code)]
#![allow(unused)]

pub mod nau7802;
