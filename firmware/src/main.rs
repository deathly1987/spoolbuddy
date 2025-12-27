//! SpoolBuddy Firmware
//! ESP32-S3 with ELECROW CrowPanel 7.0" (800x480 RGB565)
//! Using LVGL 9.x with EEZ Studio generated UI

use esp_idf_hal::delay::FreeRtos;
use esp_idf_hal::gpio::PinDriver;
use esp_idf_hal::i2c::{I2cConfig, I2cDriver};
use esp_idf_hal::peripherals::Peripherals;
use esp_idf_hal::spi::{SpiDeviceDriver, SpiDriver, SpiDriverConfig, config::Config as SpiConfig};
use esp_idf_hal::units::Hertz;
use esp_idf_svc::eventloop::EspSystemEventLoop;
use esp_idf_svc::nvs::EspDefaultNvsPartition;
use esp_idf_sys as _;
use log::{info, warn};

// Scale module for NAU7802
mod scale;

// Scale manager with C-callable interface
mod scale_manager;

// NFC module for PN5180 (hardware integration)
mod nfc;

// NFC manager with C-callable interface (disabled until pin conflict resolved)
// mod nfc_manager;

// WiFi manager with C-callable interface
mod wifi_manager;

// Display driver C functions (handles LVGL init and EEZ UI)
extern "C" {
    fn display_init() -> i32;
    fn display_tick();
}

fn main() {
    // Initialize ESP-IDF
    esp_idf_svc::sys::link_patches();
    esp_idf_svc::log::EspLogger::initialize_default();

    info!("SpoolBuddy Firmware starting...");

    let peripherals = Peripherals::take().unwrap();

    // Initialize WiFi subsystem (must be done before display init uses I2C0)
    let sysloop = EspSystemEventLoop::take().expect("Failed to take system event loop");
    let nvs = EspDefaultNvsPartition::take().ok();

    match wifi_manager::init_wifi_system(peripherals.modem, sysloop, nvs) {
        Ok(_) => info!("WiFi subsystem ready"),
        Err(e) => warn!("WiFi init failed: {}", e),
    }

    // Initialize display, LVGL, and EEZ UI via C driver
    // Display uses I2C0 (GPIO15/16) for touch controller
    unsafe {
        info!("Initializing display and UI...");
        let result = display_init();
        if result != 0 {
            info!("Display init failed with code: {}", result);
        }
    }

    // Initialize Scale I2C bus on UART1-OUT port
    // UART1-OUT pinout: IO19-RX1, IO20-TX1, 3V3, GND
    // Using: GPIO19=SDA, GPIO20=SCL
    info!("=== SCALE I2C INIT (UART1-OUT: GPIO19/20) ===");
    let i2c1_config = I2cConfig::new().baudrate(Hertz(100_000));
    let mut scale_i2c = match I2cDriver::new(
        peripherals.i2c1,
        peripherals.pins.gpio19,  // SDA (UART1-OUT IO19-RX1)
        peripherals.pins.gpio20,  // SCL (UART1-OUT IO20-TX1)
        &i2c1_config,
    ) {
        Ok(driver) => {
            info!("Scale I2C1 initialized (SDA=GPIO19, SCL=GPIO20 on UART1-OUT)");
            Some(driver)
        }
        Err(e) => {
            warn!("Scale I2C1 init failed: {:?}", e);
            None
        }
    };

    // Scan I2C1 for devices
    if let Some(ref mut i2c) = scale_i2c {
        info!("Scanning I2C1 bus for scale...");
        let mut found_nau7802 = false;
        for addr in 0x08..0x78 {
            let mut buf = [0u8; 1];
            if i2c.read(addr, &mut buf, 100).is_ok() {
                info!("  Found I2C device at 0x{:02X}", addr);
                if addr == scale::nau7802::NAU7802_ADDR {
                    info!("  -> NAU7802 scale chip detected!");
                    found_nau7802 = true;
                }
            }
        }
        if !found_nau7802 {
            warn!("  NAU7802 not found at 0x{:02X}", scale::nau7802::NAU7802_ADDR);
        }
    }
    info!("=== SCALE I2C DONE ===");

    // Initialize scale driver and manager if I2C is ready
    if let Some(i2c) = scale_i2c {
        let mut scale_state = scale::nau7802::Nau7802State::new();

        // Leak the I2C driver to get 'static lifetime for the manager
        let i2c_static: &'static mut I2cDriver<'static> = Box::leak(Box::new(i2c));

        match scale::nau7802::init(i2c_static, &mut scale_state) {
            Ok(()) => {
                info!("NAU7802 scale initialized");
                // Transfer ownership to scale manager
                // We need to take ownership back from the leaked box
                let i2c_owned = unsafe { Box::from_raw(i2c_static as *mut I2cDriver<'static>) };
                scale_manager::init_scale_manager(*i2c_owned, scale_state);
            }
            Err(e) => warn!("NAU7802 init failed: {:?}", e),
        }
    }

    // ==========================================================================
    // Initialize PN5180 NFC Module
    // ==========================================================================
    // SPI pins on J9 header:
    //   - IO5 (J9 Pin 2) -> SCK
    //   - IO4 (J9 Pin 3) -> MISO
    //   - IO6 (J9 Pin 4) -> MOSI
    // GPIO pins on J11 header:
    //   - IO8 (J11 Pin 6) -> NSS (chip select)
    //   - IO2 (J11 Pin 5) -> BUSY
    //   - RST: Not used (software reset) - GPIO15 conflicts with Touch I2C
    info!("=== NFC SPI INIT ===");

    // First, test if GPIO4 and GPIO6 are shorted on the CrowPanel
    info!("=== GPIO SHORT TEST ===");
    info!("Testing if GPIO4 (MISO) and GPIO6 (MOSI) are shorted on CrowPanel...");
    {
        // Configure GPIO6 as output, GPIO4 as input with no pull (floating)
        use esp_idf_hal::gpio::Pull;
        let mut gpio6_out = PinDriver::output(peripherals.pins.gpio6).unwrap();
        let gpio4_in = PinDriver::input(peripherals.pins.gpio4, Pull::Floating).unwrap();

        // Test 1: Set GPIO6 HIGH, read GPIO4
        gpio6_out.set_high().unwrap();
        FreeRtos::delay_ms(10);
        let read_high = gpio4_in.is_high();
        info!("  GPIO6=HIGH -> GPIO4 reads: {}", if read_high { "HIGH" } else { "LOW" });

        // Test 2: Set GPIO6 LOW, read GPIO4
        gpio6_out.set_low().unwrap();
        FreeRtos::delay_ms(10);
        let read_low = gpio4_in.is_low();
        info!("  GPIO6=LOW  -> GPIO4 reads: {}", if read_low { "LOW" } else { "HIGH" });

        if read_high && read_low {
            info!("  *** GPIO4 and GPIO6 ARE SHORTED! ***");
            info!("  This is a CrowPanel hardware issue - these pins are connected internally.");
            info!("  You need to use different pins for MOSI and MISO.");
        } else {
            info!("  GPIO4 and GPIO6 appear independent (not shorted)");
        }

        // Release pins for next test
        drop(gpio6_out);
        drop(gpio4_in);

        // Test 3: Check if GPIO4 (MISO) is shorted to GND
        info!("Testing if GPIO4 (MISO) is shorted to GND...");

        // Re-steal GPIO4 for the pull-up test
        let gpio4_stolen = unsafe { esp_idf_hal::gpio::Gpio4::steal() };

        // Configure GPIO4 as input with PULL-UP - if shorted to GND, it will still read LOW
        let gpio4_pullup = PinDriver::input(gpio4_stolen, Pull::Up).unwrap();
        FreeRtos::delay_ms(10);
        let miso_with_pullup = gpio4_pullup.is_high();
        info!("  GPIO4 with internal pull-up: {}", if miso_with_pullup { "HIGH (normal)" } else { "LOW (stuck!)" });

        if !miso_with_pullup {
            info!("  *** GPIO4 (MISO) IS SHORTED TO GND! ***");
            info!("  Even with internal pull-up, it reads LOW.");
            info!("  Check your MISO solder joint for bridges to GND.");
        }

        // Release pin for SPI use
        drop(gpio4_pullup);
    }
    info!("=== GPIO SHORT TEST DONE ===");

    // ==========================================================================
    // BIT-BANG SPI TEST - Tests physical wiring before SPI peripheral init
    // ==========================================================================
    // This test manually toggles GPIO pins to verify physical connections
    // to the PN5180, bypassing the ESP32's SPI peripheral entirely.
    info!("=== BIT-BANG SPI TEST ===");
    info!("This test manually toggles GPIOs to verify physical wiring.");
    info!("If this test passes but SPI fails, the issue is with the ESP32 SPI peripheral.");
    {
        use esp_idf_hal::gpio::Pull;

        // Steal the pins for bit-bang test
        let gpio4_bb = unsafe { esp_idf_hal::gpio::Gpio4::steal() };
        let gpio5_bb = unsafe { esp_idf_hal::gpio::Gpio5::steal() };
        let gpio6_bb = unsafe { esp_idf_hal::gpio::Gpio6::steal() };
        let gpio8_bb = unsafe { esp_idf_hal::gpio::Gpio8::steal() };

        // Configure pins:
        // - GPIO5 (SCK) = output
        // - GPIO6 (MOSI) = output
        // - GPIO4 (MISO) = input with pull-up
        // - GPIO8 (NSS) = output
        let mut sck = PinDriver::output(gpio5_bb).unwrap();
        let mut mosi = PinDriver::output(gpio6_bb).unwrap();
        let miso = PinDriver::input(gpio4_bb, Pull::Up).unwrap();
        let mut nss = PinDriver::output(gpio8_bb).unwrap();

        // Initial state: SCK low, MOSI low, NSS high
        sck.set_low().unwrap();
        mosi.set_low().unwrap();
        nss.set_high().unwrap();
        FreeRtos::delay_ms(10);

        info!("Initial state: SCK=LOW, MOSI=LOW, NSS=HIGH");
        info!("  MISO reads: {}", if miso.is_high() { "HIGH (floating with pull-up)" } else { "LOW" });

        // Test 1: Toggle NSS and check MISO
        info!("Test BB-1: NSS toggle test");
        nss.set_low().unwrap();
        FreeRtos::delay_ms(5);
        let miso_nss_low = miso.is_high();
        info!("  NSS=LOW  -> MISO={}", if miso_nss_low { "HIGH" } else { "LOW" });

        nss.set_high().unwrap();
        FreeRtos::delay_ms(5);
        let miso_nss_high = miso.is_high();
        info!("  NSS=HIGH -> MISO={}", if miso_nss_high { "HIGH" } else { "LOW" });

        // Test 2: Bit-bang a READ_EEPROM command for firmware version
        // PN5180 protocol: send [0x07, 0x10, 0x02] to read 2 bytes from EEPROM addr 0x10
        info!("Test BB-2: Bit-bang READ_EEPROM command");
        info!("  Sending: [0x07, 0x10, 0x02] (READ_EEPROM, addr=0x10, len=2)");

        // Macro to bit-bang one byte (MSB first, SPI Mode 0)
        macro_rules! bitbang_byte {
            ($sck:expr, $mosi:expr, $miso:expr, $byte:expr) => {{
                let byte: u8 = $byte;
                let mut rx = 0u8;
                for i in 0..8 {
                    // Set MOSI for next bit (MSB first)
                    if (byte >> (7 - i)) & 1 == 1 {
                        $mosi.set_high().unwrap();
                    } else {
                        $mosi.set_low().unwrap();
                    }
                    // Small delay for setup time
                    for _ in 0..10 { core::hint::spin_loop(); }

                    // Rising edge of SCK - sample MISO
                    $sck.set_high().unwrap();
                    // Small delay
                    for _ in 0..10 { core::hint::spin_loop(); }
                    // Sample MISO
                    if $miso.is_high() {
                        rx |= 1 << (7 - i);
                    }

                    // Falling edge of SCK
                    $sck.set_low().unwrap();
                    // Small delay
                    for _ in 0..10 { core::hint::spin_loop(); }
                }
                rx
            }};
        }

        // Cycle 1: Send command
        nss.set_low().unwrap();
        FreeRtos::delay_ms(2);

        let cmd = [0x07u8, 0x10, 0x02];
        let mut rx_cmd = [0u8; 3];
        for (i, &b) in cmd.iter().enumerate() {
            rx_cmd[i] = bitbang_byte!(sck, mosi, miso, b);
        }
        info!("  TX: {:02X?}", cmd);
        info!("  RX during TX: {:02X?}", rx_cmd);

        nss.set_high().unwrap();
        FreeRtos::delay_ms(30); // Wait for PN5180 to process

        // Cycle 2: Read response
        nss.set_low().unwrap();
        FreeRtos::delay_ms(2);

        let mut response = [0u8; 2];
        for i in 0..2 {
            response[i] = bitbang_byte!(sck, mosi, miso, 0xFFu8);
        }
        info!("  Response: {:02X?}", response);

        nss.set_high().unwrap();

        // Analyze results
        if response == [0xFF, 0xFF] {
            info!("  Result: All 0xFF - PN5180 not responding");
            info!("  -> Physical wiring issue OR PN5180 not powered/damaged");
        } else if response == [0x00, 0x00] {
            info!("  Result: All 0x00 - MISO shorted to GND");
        } else {
            info!("  Result: Got data! Firmware version bytes: {:02X?}", response);
            let major = response[1] >> 4;
            let minor = response[1] & 0x0F;
            let patch = response[0];
            info!("  Decoded: FW {}.{}.{}", major, minor, patch);
            if major > 0 || minor > 0 || patch > 0 {
                info!("  *** BIT-BANG SUCCESS! Physical wiring is correct! ***");
            }
        }

        // Test 3: SCK toggle test - verify SCK is actually reaching PN5180
        info!("Test BB-3: SCK activity test");
        nss.set_low().unwrap();
        FreeRtos::delay_ms(1);

        info!("  Toggling SCK 8 times, watching MISO...");
        let mut miso_states = [0u8; 8];
        for i in 0..8 {
            sck.set_high().unwrap();
            for _ in 0..5 { core::hint::spin_loop(); }
            miso_states[i] = if miso.is_high() { 1 } else { 0 };
            sck.set_low().unwrap();
            for _ in 0..5 { core::hint::spin_loop(); }
        }
        info!("  MISO during SCK toggles: {:?}", miso_states);

        let all_same = miso_states.iter().all(|&x| x == miso_states[0]);
        if all_same {
            info!("  MISO stayed {} - PN5180 not seeing clock or not responding",
                if miso_states[0] == 1 { "HIGH" } else { "LOW" });
        } else {
            info!("  MISO changed during clock - PN5180 is responding!");
        }

        nss.set_high().unwrap();

        // Test 4: GPIO pin verification (internal loopback via MOSI->MISO short)
        info!("");
        info!("Test BB-4: GPIO OUTPUT VERIFICATION");
        info!("  Testing if GPIO5 (SCK) and GPIO6 (MOSI) can actually drive output...");

        // Read GPIO5 and GPIO6 output state using GPIO_OUT register
        let gpio_out_before: u32;
        unsafe {
            gpio_out_before = core::ptr::read_volatile(0x60004004 as *const u32);
        }
        info!("  GPIO_OUT before: SCK(5)={} MOSI(6)={}",
            (gpio_out_before >> 5) & 1, (gpio_out_before >> 6) & 1);

        // Set both HIGH
        sck.set_high().unwrap();
        mosi.set_high().unwrap();
        FreeRtos::delay_ms(1);
        let gpio_out_high: u32;
        let gpio_in_high: u32;
        unsafe {
            gpio_out_high = core::ptr::read_volatile(0x60004004 as *const u32);
            gpio_in_high = core::ptr::read_volatile(0x6000403C as *const u32);
        }
        info!("  Set HIGH: GPIO_OUT SCK={} MOSI={}, GPIO_IN SCK={} MOSI={}",
            (gpio_out_high >> 5) & 1, (gpio_out_high >> 6) & 1,
            (gpio_in_high >> 5) & 1, (gpio_in_high >> 6) & 1);

        // Set both LOW
        sck.set_low().unwrap();
        mosi.set_low().unwrap();
        FreeRtos::delay_ms(1);
        let gpio_out_low: u32;
        let gpio_in_low: u32;
        unsafe {
            gpio_out_low = core::ptr::read_volatile(0x60004004 as *const u32);
            gpio_in_low = core::ptr::read_volatile(0x6000403C as *const u32);
        }
        info!("  Set LOW:  GPIO_OUT SCK={} MOSI={}, GPIO_IN SCK={} MOSI={}",
            (gpio_out_low >> 5) & 1, (gpio_out_low >> 6) & 1,
            (gpio_in_low >> 5) & 1, (gpio_in_low >> 6) & 1);

        // Check if GPIO_OUT actually changed
        let sck_out_works = ((gpio_out_high >> 5) & 1) != ((gpio_out_low >> 5) & 1);
        let mosi_out_works = ((gpio_out_high >> 6) & 1) != ((gpio_out_low >> 6) & 1);
        let sck_in_works = ((gpio_in_high >> 5) & 1) != ((gpio_in_low >> 5) & 1);
        let mosi_in_works = ((gpio_in_high >> 6) & 1) != ((gpio_in_low >> 6) & 1);

        info!("  GPIO_OUT changes: SCK={} MOSI={}",
            if sck_out_works { "YES" } else { "NO!" },
            if mosi_out_works { "YES" } else { "NO!" });
        info!("  GPIO_IN  changes: SCK={} MOSI={}",
            if sck_in_works { "YES" } else { "NO!" },
            if mosi_in_works { "YES" } else { "NO!" });

        if !sck_out_works || !mosi_out_works {
            info!("");
            info!("  *** GPIO OUTPUT REGISTER NOT CHANGING! ***");
            info!("  The PinDriver::set_high/set_low is not working.");
            info!("  This could be a driver bug or hardware issue.");
        }

        if sck_out_works && !sck_in_works {
            info!("");
            info!("  *** SCK: GPIO_OUT changes but GPIO_IN doesn't! ***");
            info!("  The pin is being set but something is overriding it.");
            info!("  Check if GPIO5 is connected to something else on CrowPanel.");
        }

        if mosi_out_works && !mosi_in_works {
            info!("");
            info!("  *** MOSI: GPIO_OUT changes but GPIO_IN doesn't! ***");
            info!("  The pin is being set but something is overriding it.");
            info!("  Check if GPIO6 is connected to something else on CrowPanel.");
        }

        // Test 5: SCK -> MISO loopback test (if wired)
        info!("");
        info!("Test BB-5: SCK -> MISO loopback test");
        info!("  (If you shorted J9-Pin2 to J9-Pin3, this tests if SCK output works)");

        // Toggle SCK while watching MISO
        let mut sck_loopback_works = true;
        for i in 0..4 {
            let expected = i % 2 == 0; // alternate HIGH/LOW
            if expected {
                sck.set_high().unwrap();
            } else {
                sck.set_low().unwrap();
            }
            FreeRtos::delay_ms(2);
            let actual = miso.is_high();
            info!("  SCK={} -> MISO={} {}",
                if expected { "HIGH" } else { "LOW" },
                if actual { "HIGH" } else { "LOW" },
                if expected == actual { "✓" } else { "✗ MISMATCH" });
            if expected != actual {
                sck_loopback_works = false;
            }
        }
        sck.set_low().unwrap();

        if sck_loopback_works {
            info!("  *** SCK -> MISO LOOPBACK WORKS! GPIO5 is functional! ***");
        } else {
            info!("  SCK loopback failed - either wire not connected or GPIO5 not reaching J9-Pin2");
        }

        // Test 6: MOSI -> MISO loopback test (if wired)
        info!("");
        info!("Test BB-6: MOSI -> MISO loopback test");
        info!("  (If you shorted J9-Pin4 to J9-Pin3, this tests if MOSI output works)");

        let mut mosi_loopback_works = true;
        for i in 0..4 {
            let expected = i % 2 == 0;
            if expected {
                mosi.set_high().unwrap();
            } else {
                mosi.set_low().unwrap();
            }
            FreeRtos::delay_ms(2);
            let actual = miso.is_high();
            info!("  MOSI={} -> MISO={} {}",
                if expected { "HIGH" } else { "LOW" },
                if actual { "HIGH" } else { "LOW" },
                if expected == actual { "✓" } else { "✗ MISMATCH" });
            if expected != actual {
                mosi_loopback_works = false;
            }
        }
        mosi.set_low().unwrap();

        if mosi_loopback_works {
            info!("  *** MOSI -> MISO LOOPBACK WORKS! GPIO6 is functional! ***");
        } else {
            info!("  MOSI loopback failed - either wire not connected or GPIO6 not reaching J9-Pin4");
        }

        // Summary
        info!("");
        info!("=== LOOPBACK TEST SUMMARY ===");
        if mosi_loopback_works && !sck_loopback_works {
            info!("MOSI works but SCK doesn't - GPIO5 may not be connected to J9-Pin2!");
            info!("Try using a different GPIO for SCK.");
        } else if sck_loopback_works && !mosi_loopback_works {
            info!("SCK works but MOSI doesn't - GPIO6 may not be connected to J9-Pin4!");
            info!("Try using a different GPIO for MOSI.");
        } else if sck_loopback_works && mosi_loopback_works {
            info!("Both SCK and MOSI loopbacks work - GPIO pins are functional!");
            info!("If PN5180 still doesn't respond, check:");
            info!("  - NSS (GPIO8) connection to PN5180");
            info!("  - VCC/GND power to PN5180");
            info!("  - PN5180 module itself may be damaged");
        } else {
            info!("Neither loopback worked - check your wire connections");
            info!("  Short J9-Pin2 to J9-Pin3 for SCK test");
            info!("  Short J9-Pin4 to J9-Pin3 for MOSI test");
        }

        // Release pins so they can be used by SPI
        drop(sck);
        drop(mosi);
        drop(miso);
        drop(nss);
    }
    info!("=== BIT-BANG TEST DONE ===");

    // Re-take the pins for SPI (they were consumed by the GPIO test)
    let gpio4 = unsafe { esp_idf_hal::gpio::Gpio4::steal() };
    let gpio5 = unsafe { esp_idf_hal::gpio::Gpio5::steal() };
    let gpio6 = unsafe { esp_idf_hal::gpio::Gpio6::steal() };

    // Enable internal pull-up on MISO (GPIO4) to prevent floating
    // This helps diagnose if PN5180 is actively driving LOW vs line floating
    info!("Enabling internal pull-up on MISO (GPIO4) via IO_MUX...");
    unsafe {
        // ESP32-S3 IO_MUX register addresses (from TRM):
        // Base: 0x60009000, GPIO4 offset: 0x14
        let io_mux_gpio4 = 0x60009000 + 0x14;  // IO_MUX_GPIO4_REG (corrected!)
        let current = core::ptr::read_volatile(io_mux_gpio4 as *const u32);
        // Bit 8 = FUN_WPU (pull-up), Bit 7 = FUN_WPD (pull-down)
        let new_val = (current | (1 << 8)) & !(1 << 7);  // Enable pull-up, disable pull-down
        core::ptr::write_volatile(io_mux_gpio4 as *mut u32, new_val);
        info!("  GPIO4 IO_MUX @ 0x{:08X}: 0x{:08X} -> 0x{:08X}", io_mux_gpio4, current, new_val);

        // Also check GPIO_ENABLE_REG to see if something is driving GPIO4 as output
        let gpio_enable = 0x60004020 as *const u32;  // GPIO_ENABLE_REG
        let gpio_enable_val = core::ptr::read_volatile(gpio_enable);
        let gpio4_is_output = (gpio_enable_val >> 4) & 1;
        info!("  GPIO_ENABLE_REG: 0x{:08X} (GPIO4 output={}))", gpio_enable_val, gpio4_is_output);

        // Check GPIO_IN_REG to see the actual pin state
        let gpio_in = 0x6000403C as *const u32;  // GPIO_IN_REG
        let gpio_in_val = core::ptr::read_volatile(gpio_in);
        let gpio4_level = (gpio_in_val >> 4) & 1;
        info!("  GPIO_IN_REG: 0x{:08X} (GPIO4 level={})", gpio_in_val, gpio4_level);

        // Check SPI3 MISO signal routing via GPIO matrix
        let gpio_func_in_sel_cfg = 0x60004154 + (63 * 4);  // FSPIQ_IN signal is 63 for SPI3 MISO
        let func_in_val = core::ptr::read_volatile(gpio_func_in_sel_cfg as *const u32);
        info!("  SPI3_MISO func_in_sel: 0x{:08X}", func_in_val);
    }

    // Initialize SPI bus - try SPI3 instead of SPI2 (maybe SPI2 has internal issues)
    let spi_driver = match SpiDriver::new(
        peripherals.spi3,
        gpio5,  // SCK
        gpio6,  // MOSI
        Some(gpio4),  // MISO
        &SpiDriverConfig::default(),
    ) {
        Ok(driver) => {
            info!("SPI3 bus initialized (SCK=GPIO5, MOSI=GPIO6, MISO=GPIO4)");

            // Check GPIO state AFTER SPI initialization
            info!("=== GPIO STATE AFTER SPI INIT ===");
            unsafe {
                // Check all SPI pins: GPIO4=MISO, GPIO5=SCK, GPIO6=MOSI, GPIO8=NSS

                // GPIO_ENABLE - which pins are outputs
                let gpio_enable_val = core::ptr::read_volatile(0x60004020 as *const u32);
                info!("  GPIO_ENABLE: 0x{:08X}", gpio_enable_val);
                info!("    GPIO4(MISO)={} GPIO5(SCK)={} GPIO6(MOSI)={} GPIO8(NSS)={}",
                    (gpio_enable_val >> 4) & 1,
                    (gpio_enable_val >> 5) & 1,
                    (gpio_enable_val >> 6) & 1,
                    (gpio_enable_val >> 8) & 1);

                // GPIO_OUT - what values are being driven
                let gpio_out_val = core::ptr::read_volatile(0x60004004 as *const u32);
                info!("  GPIO_OUT: 0x{:08X}", gpio_out_val);

                // Check FUNC_OUT_SEL for each pin (which peripheral signal is routed)
                let gpio4_out = core::ptr::read_volatile((0x60004554 + 4*4) as *const u32);
                let gpio5_out = core::ptr::read_volatile((0x60004554 + 5*4) as *const u32);
                let gpio6_out = core::ptr::read_volatile((0x60004554 + 6*4) as *const u32);
                let gpio8_out = core::ptr::read_volatile((0x60004554 + 8*4) as *const u32);
                info!("  FUNC_OUT_SEL: GPIO4=0x{:02X} GPIO5=0x{:02X} GPIO6=0x{:02X} GPIO8=0x{:02X}",
                    gpio4_out & 0x1FF, gpio5_out & 0x1FF, gpio6_out & 0x1FF, gpio8_out & 0x1FF);
                info!("    Expected: GPIO5=SPICLK(114) GPIO6=SPID(115) GPIO4=input");

                // Check SPI3 peripheral registers
                // ESP32-S3: SPI2=0x60024000, SPI3=0x60025000
                // Offsets: CMD=0x00, ADDR=0x04, CTRL=0x08, CLOCK=0x0C, USER=0x10, MISC=0x3C
                let spi3_base = 0x60025000;

                // SPI_CLOCK_REG - clock configuration (offset 0x0C!)
                let spi_clk = core::ptr::read_volatile((spi3_base + 0x0C) as *const u32);
                info!("  SPI3_CLOCK: 0x{:08X}", spi_clk);

                // SPI_USER_REG - user config
                let spi_user = core::ptr::read_volatile((spi3_base + 0x10) as *const u32);
                info!("  SPI3_USER: 0x{:08X}", spi_user);

                // SPI_MISC_REG - might have loopback or other issues (offset 0x3C)
                let spi_misc = core::ptr::read_volatile((spi3_base + 0x3C) as *const u32);
                info!("  SPI3_MISC: 0x{:08X}", spi_misc);

                // Check GPIO_IN to see actual pin states
                let gpio_in_val = core::ptr::read_volatile(0x6000403C as *const u32);
                info!("  GPIO_IN: 0x{:08X}", gpio_in_val);
                info!("    GPIO4={} GPIO5={} GPIO6={} GPIO8={}",
                    (gpio_in_val >> 4) & 1,
                    (gpio_in_val >> 5) & 1,
                    (gpio_in_val >> 6) & 1,
                    (gpio_in_val >> 8) & 1);
            }
            info!("=== END GPIO STATE ===");

            // FIX: The esp-idf-hal SPI driver may misconfigure GPIO pins AND
            // may not enable the SPI3 peripheral clock!
            info!("=== FIXING SPI3 PERIPHERAL ===");
            unsafe {
                // ESP32-S3 SPI clock enable is in PERIP_CLK_EN0, not PERIP_CLK_EN1!
                // SYSTEM_PERIP_CLK_EN0_REG = 0x6002600C
                // Bit 6 = SPI2_CLK_EN
                // Bit 7 = SPI3_CLK_EN
                let perip_clk_en0 = 0x6002600C as *mut u32;
                let current_clk0 = core::ptr::read_volatile(perip_clk_en0);
                let new_clk0 = current_clk0 | (1 << 7);  // Enable SPI3 clock (bit 7)
                core::ptr::write_volatile(perip_clk_en0, new_clk0);
                info!("  PERIP_CLK_EN0: was 0x{:08X}, now 0x{:08X} (SPI3=bit7)", current_clk0, new_clk0);

                // Also check PERIP_CLK_EN1 (bit 23 might be something else)
                let perip_clk_en1 = 0x60026010 as *mut u32;
                let current_clk1 = core::ptr::read_volatile(perip_clk_en1);
                let new_clk1 = current_clk1 | (1 << 23);  // Enable whatever is at bit 23
                core::ptr::write_volatile(perip_clk_en1, new_clk1);
                info!("  PERIP_CLK_EN1: was 0x{:08X}, now 0x{:08X} (bit23)", current_clk1, new_clk1);

                // Clear SPI3 peripheral reset in PERIP_RST_EN0
                // SYSTEM_PERIP_RST_EN0_REG = 0x60026020
                // Bit 7 = SPI3_RST (1=in reset, 0=not reset)
                let perip_rst_en0 = 0x60026020 as *mut u32;
                let current_rst0 = core::ptr::read_volatile(perip_rst_en0);
                let new_rst0 = current_rst0 & !(1 << 7);  // Clear SPI3 reset
                core::ptr::write_volatile(perip_rst_en0, new_rst0);
                info!("  PERIP_RST_EN0: was 0x{:08X}, now 0x{:08X} (SPI3=bit7)", current_rst0, new_rst0);

                // Also clear in PERIP_RST_EN1 just in case
                let perip_rst_en1 = 0x60026024 as *mut u32;
                let current_rst1 = core::ptr::read_volatile(perip_rst_en1);
                let new_rst1 = current_rst1 & !(1 << 23);
                core::ptr::write_volatile(perip_rst_en1, new_rst1);
                info!("  PERIP_RST_EN1: was 0x{:08X}, now 0x{:08X} (bit23)", current_rst1, new_rst1);

                // Check SPI3 base registers after clock enable
                // ESP32-S3: SPI2=0x60024000, SPI3=0x60025000
                // Offsets: CMD=0x00, ADDR=0x04, CTRL=0x08, CLOCK=0x0C, USER=0x10
                let spi3_base = 0x60025000;
                let spi_clk_before = core::ptr::read_volatile((spi3_base + 0x0C) as *const u32);
                info!("  SPI3 CLOCK reg before manual config: 0x{:08X}", spi_clk_before);

                // If SPI3 registers are still zero, manually configure basic settings
                // For 1 MHz SPI with 80 MHz APB clock:
                // CLKCNT_N = 79, CLKCNT_H = 39, CLKCNT_L = 79, CLKDIV_PRE = 0
                // SPI_CLK_REG = (39 << 6) | (79 << 0) | (79 << 12) | (0 << 18) | (0 << 31)
                //             = 0x0004F9CF
                if spi_clk_before == 0 {
                    info!("  SPI3 registers are zero - configuring manually!");

                    // Configure clock divider for ~1 MHz
                    // APB clock is 80 MHz, so divide by 80 for 1 MHz
                    let clk_val: u32 = (79 << 0)   // CLKCNT_L
                                     | (39 << 6)   // CLKCNT_H
                                     | (79 << 12)  // CLKCNT_N
                                     | (0 << 18);  // CLKDIV_PRE
                    core::ptr::write_volatile((spi3_base + 0x0C) as *mut u32, clk_val);  // CLOCK at 0x0C!
                    info!("  SPI3_CLOCK set to: 0x{:08X}", clk_val);

                    // Configure SPI_USER for Mode 0
                    // USR_MOSI = 1 (bit 27), USR_MISO = 1 (bit 28)
                    // CK_OUT_EDGE = 0 (sample on rising), CS_SETUP = 1, CS_HOLD = 1
                    let user_val: u32 = (1 << 27)   // USR_MOSI
                                      | (1 << 28)   // USR_MISO
                                      | (1 << 7)    // CS_SETUP
                                      | (1 << 8);   // CS_HOLD
                    core::ptr::write_volatile((spi3_base + 0x10) as *mut u32, user_val);
                    info!("  SPI3_USER set to: 0x{:08X}", user_val);
                }
            }

            info!("=== FIXING SPI3 GPIO ROUTING ===");
            unsafe {
                // ESP32-S3 GPSPI3 signal numbers (from TRM):
                // SPICLK_OUT = 114 (SCK output)
                // SPID_OUT = 115 (MOSI output)
                // SPIQ_IN = 116 (MISO input)
                // SPICS0_OUT = 117 (CS output) - but we use GPIO for NSS

                // 1. Fix GPIO4 (MISO) - make it input, route to SPIQ_IN
                let gpio_enable_w1tc = 0x60004028 as *mut u32;
                core::ptr::write_volatile(gpio_enable_w1tc, 1 << 4);  // Disable GPIO4 output

                // Route SPIQ_IN (signal 116) from GPIO4
                let spiq_in_sel = 0x60004154 + (116 * 4);
                core::ptr::write_volatile(spiq_in_sel as *mut u32, (1 << 7) | 4);  // sig_in_sel=1, gpio=4
                info!("  GPIO4 (MISO): disabled output, routed SPIQ_IN from GPIO4");

                // 2. Fix GPIO5 (SCK) - route SPICLK_OUT (signal 114) to it
                let gpio5_func_out = 0x60004554 + (5 * 4);
                let current_gpio5 = core::ptr::read_volatile(gpio5_func_out as *const u32);
                core::ptr::write_volatile(gpio5_func_out as *mut u32, 114);  // SPICLK_OUT
                info!("  GPIO5 (SCK): FUNC_OUT was 0x{:02X}, set to 114 (SPICLK_OUT)", current_gpio5 & 0x1FF);

                // 3. Fix GPIO6 (MOSI) - route SPID_OUT (signal 115) to it
                let gpio6_func_out = 0x60004554 + (6 * 4);
                let current_gpio6 = core::ptr::read_volatile(gpio6_func_out as *const u32);
                core::ptr::write_volatile(gpio6_func_out as *mut u32, 115);  // SPID_OUT
                info!("  GPIO6 (MOSI): FUNC_OUT was 0x{:02X}, set to 115 (SPID_OUT)", current_gpio6 & 0x1FF);

                // 4. GPIO8 (NSS) - keep as GPIO output (we control it manually)
                // No change needed, just verify it's set to GPIO function (0x100 = no peripheral)
                let gpio8_func_out = 0x60004554 + (8 * 4);
                let current_gpio8 = core::ptr::read_volatile(gpio8_func_out as *const u32);
                info!("  GPIO8 (NSS): FUNC_OUT is 0x{:02X} (GPIO mode)", current_gpio8 & 0x1FF);

                // 5. Make sure GPIO4 has pull-up enabled
                let io_mux_gpio4 = 0x60009014 as *mut u32;
                let mux_val = core::ptr::read_volatile(io_mux_gpio4);
                let new_mux = (mux_val & !(0x7 << 12)) | (1 << 12) | (1 << 8);
                core::ptr::write_volatile(io_mux_gpio4, new_mux);

                // Verify final state
                let gpio_enable_final = core::ptr::read_volatile(0x60004020 as *const u32);
                let gpio5_final = core::ptr::read_volatile(gpio5_func_out as *const u32);
                let gpio6_final = core::ptr::read_volatile(gpio6_func_out as *const u32);
                info!("  Final FUNC_OUT: GPIO5=0x{:02X} GPIO6=0x{:02X}",
                    gpio5_final & 0x1FF, gpio6_final & 0x1FF);
                info!("  Final GPIO_ENABLE: 0x{:08X} (GPIO4={} GPIO5={} GPIO6={})",
                    gpio_enable_final,
                    (gpio_enable_final >> 4) & 1,
                    (gpio_enable_final >> 5) & 1,
                    (gpio_enable_final >> 6) & 1);

                // Verify SPI3 peripheral clock is now enabled
                let clk_after = core::ptr::read_volatile(0x60026010 as *const u32);
                let spi3_clk_en = (clk_after >> 23) & 1;
                info!("  PERIP_CLK_EN1 after fix: 0x{:08X} (SPI3_CLK={})", clk_after, spi3_clk_en);

                // Check SPI3 registers after GPIO routing
                let spi3_base = 0x60025000;  // SPI3 (not SPI2 which is 0x60024000)
                let spi_clk = core::ptr::read_volatile((spi3_base + 0x0C) as *const u32);
                let spi_user = core::ptr::read_volatile((spi3_base + 0x10) as *const u32);
                let spi_ctrl = core::ptr::read_volatile((spi3_base + 0x08) as *const u32);
                let spi_cmd = core::ptr::read_volatile((spi3_base + 0x00) as *const u32);
                info!("  SPI3 after GPIO routing: CMD=0x{:08X} CTRL=0x{:08X} CLOCK=0x{:08X} USER=0x{:08X}",
                    spi_cmd, spi_ctrl, spi_clk, spi_user);

                // FIX: SPI clock might be too fast (bit 31 = CLK_EQU_SYSCLK means 80MHz!)
                // Force proper clock dividers for 1 MHz: APB=80MHz / 80 = 1MHz
                // CLKCNT_L = 79, CLKCNT_H = 39, CLKCNT_N = 79, CLKDIV_PRE = 0
                // Clear bit 31 to use dividers instead of APB clock directly
                if (spi_clk >> 31) & 1 == 1 {
                    info!("  !!! SPI clock too fast (CLK_EQU_SYSCLK=1), fixing to 1 MHz !!!");
                    let clk_val: u32 = (79 << 0)   // CLKCNT_L
                                     | (39 << 6)   // CLKCNT_H
                                     | (79 << 12)  // CLKCNT_N
                                     | (0 << 18);  // CLKDIV_PRE (no bit 31!)
                    core::ptr::write_volatile((spi3_base + 0x0C) as *mut u32, clk_val);
                    let clk_after = core::ptr::read_volatile((spi3_base + 0x0C) as *const u32);
                    info!("  SPI3_CLOCK fixed: 0x{:08X} -> 0x{:08X}", spi_clk, clk_after);
                }

                // Increase GPIO drive strength for SCK (GPIO5) and MOSI (GPIO6)
                // IO_MUX drive strength is bits [9:8]: 0=5mA, 1=10mA, 2=20mA, 3=40mA
                let io_mux_gpio5 = 0x60009018 as *mut u32;  // GPIO5 IO_MUX
                let io_mux_gpio6 = 0x6000901C as *mut u32;  // GPIO6 IO_MUX
                let mux5 = core::ptr::read_volatile(io_mux_gpio5);
                let mux6 = core::ptr::read_volatile(io_mux_gpio6);
                // Set drive strength to maximum (3 = 40mA)
                let new_mux5 = (mux5 & !(0x3 << 8)) | (3 << 8);
                let new_mux6 = (mux6 & !(0x3 << 8)) | (3 << 8);
                core::ptr::write_volatile(io_mux_gpio5, new_mux5);
                core::ptr::write_volatile(io_mux_gpio6, new_mux6);
                info!("  GPIO5 drive: 0x{:08X} -> 0x{:08X}", mux5, new_mux5);
                info!("  GPIO6 drive: 0x{:08X} -> 0x{:08X}", mux6, new_mux6);
            }
            info!("=== SPI3 FIX DONE ===");

            Some(driver)
        }
        Err(e) => {
            warn!("SPI3 init failed: {:?}", e);
            None
        }
    };

    // Initialize NFC if SPI is ready
    if let Some(spi_bus) = spi_driver {
        // Leak SPI driver to get 'static lifetime
        let spi_static: &'static mut SpiDriver<'static> = Box::leak(Box::new(spi_bus));

        // Create SPI device (CS is manually controlled via GPIO8)
        // PN5180 uses SPI Mode 0: CPOL=0 (idle low), CPHA=0 (sample on rising edge)
        use esp_idf_hal::spi::config::{Mode, Phase, Polarity};
        // Try faster SPI speed - slow speeds allow more capacitive coupling
        let spi_config = SpiConfig::default()
            .baudrate(Hertz(1_000_000)) // 1 MHz - faster to reduce coupling
            .data_mode(Mode {
                polarity: Polarity::IdleLow,
                phase: Phase::CaptureOnFirstTransition,
            });
        info!("SPI Mode 0 configured (CPOL=0, CPHA=0) at 1 MHz");
        match SpiDeviceDriver::new(spi_static, Option::<esp_idf_hal::gpio::AnyOutputPin>::None, &spi_config) {
            Ok(spi_device) => {
                // Initialize GPIO pins for NFC
                // NSS: GPIO8 (J11 Pin 6)
                // BUSY: Not used (GPIO44 doesn't work properly)
                // RST: Not used (GPIO15 conflicts with touch I2C)
                let nss_result = PinDriver::output(peripherals.pins.gpio8);

                match nss_result {
                    Ok(nss) => {
                        let mut nfc_state = nfc::pn5180::Pn5180State::new();

                        // Create driver manually to run diagnostics before full init
                        info!("=== PN5180 PRE-INIT DIAGNOSTICS ===");

                        // Set NSS high initially (inactive)
                        let mut nss = nss;
                        let _ = nss.set_high();
                        FreeRtos::delay_ms(100);  // Wait for PN5180 power-on

                        // Create a temporary driver just for diagnostics
                        let mut diag_driver = nfc::pn5180::Pn5180Driver {
                            spi: spi_device,
                            nss,
                            busy: None,
                            rst: None,
                        };

                        // Run comprehensive SPI diagnostics
                        match diag_driver.spi_diagnostic_test() {
                            Ok(_) => info!("SPI diagnostics completed"),
                            Err(e) => warn!("SPI diagnostics error: {:?}", e),
                        }

                        // Try to init properly after diagnostics
                        let (spi_device, nss) = (diag_driver.spi, diag_driver.nss);
                        match nfc::pn5180::init_pn5180(spi_device, nss, None, None, &mut nfc_state) {
                            Ok(mut driver) => {
                                info!("PN5180 NFC initialized successfully");

                                // Continuous firmware version test
                                info!("=== CONTINUOUS FW VERSION TEST ===");
                                info!("(Running 10 tests, ~2 per second)");

                                for i in 0..10 {
                                    let version = driver.get_firmware_version();
                                    match version {
                                        Ok((major, minor, patch)) => {
                                            if major == 0 && minor == 0 && patch == 0 {
                                                info!("#{:02}: FW=0.0.0 (bad - 0x00)", i + 1);
                                            } else if major == 15 && minor == 15 && patch == 255 {
                                                info!("#{:02}: FW=15.15.255 (bad - 0xFF)", i + 1);
                                            } else {
                                                info!("#{:02}: FW={}.{}.{} *** GOOD! ***", i + 1, major, minor, patch);
                                            }
                                        }
                                        Err(e) => {
                                            info!("#{:02}: Error {:?}", i + 1, e);
                                        }
                                    }
                                    FreeRtos::delay_ms(500);
                                }

                                info!("=== FW TEST DONE ===");
                            }
                            Err(e) => warn!("PN5180 init failed: {:?}", e),
                        }
                    }
                    Err(e) => warn!("Failed to initialize NFC NSS pin (GPIO8): {:?}", e),
                }
            }
            Err(e) => warn!("SPI device creation failed: {:?}", e),
        }
    }

    info!("Entering main loop...");

    // Main loop counter for periodic tasks
    let mut loop_count: u32 = 0;

    // Main loop
    loop {
        unsafe {
            display_tick();
        }

        // Poll scale every 10 iterations (~50ms at 5ms delay)
        loop_count = loop_count.wrapping_add(1);
        if loop_count % 10 == 0 {
            scale_manager::poll_scale();
        }

        // Poll NFC every 20 iterations (~100ms at 5ms delay)
        // Disabled until pin conflict with Touch I2C (GPIO15) is resolved
        // #[cfg(feature = "nfc_enabled")]
        // if loop_count % 20 == 0 {
        //     nfc_manager::poll_nfc();
        // }

        FreeRtos::delay_ms(5);
    }
}
