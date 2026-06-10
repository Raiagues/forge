#!/usr/bin/env python3
# FORGE serial bridge — owns the ESP32 serial port so the browser never has to.
# The Node flash server spawns this; it streams every serial line to stdout and
# writes anything it receives on stdin to the board. One port, hardcoded by the
# caller. No abstractions — just bytes in, bytes out.
#
#   python3 serial_bridge.py /dev/ttyUSB0 115200
#
import sys
import time
import threading

try:
    import serial
except ImportError:
    sys.stdout.write("__BRIDGE_ERROR__ pyserial not installed (pip install pyserial)\n")
    sys.stdout.flush()
    sys.exit(1)

port = sys.argv[1] if len(sys.argv) > 1 else "/dev/ttyUSB0"
baud = int(sys.argv[2]) if len(sys.argv) > 2 else 115200


def open_and_reset():
    s = serial.Serial()
    s.port = port
    s.baudrate = baud
    s.timeout = 0.2
    # Keep the board in run mode while opening (don't drop into the bootloader).
    s.dtr = False
    s.rts = False
    s.open()
    # Pulse EN to reboot the firmware so we always catch the boot banner.
    s.setDTR(False)   # IO0 high -> normal boot
    s.setRTS(True)    # EN low  -> reset asserted
    time.sleep(0.05)
    s.setDTR(False)
    s.setRTS(False)   # EN high -> run
    return s


try:
    ser = open_and_reset()
except Exception as e:  # noqa: BLE001 - surface any open failure to the client
    sys.stdout.write("__BRIDGE_ERROR__ %s\n" % e)
    sys.stdout.flush()
    sys.exit(1)

sys.stdout.write("__BRIDGE_OPEN__ %s @%d\n" % (port, baud))
sys.stdout.flush()


def reader():
    buf = b""
    while True:
        try:
            data = ser.read(256)
        except Exception as e:  # noqa: BLE001
            sys.stdout.write("__BRIDGE_ERROR__ %s\n" % e)
            sys.stdout.flush()
            return
        if not data:
            continue
        buf += data
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            sys.stdout.write(line.decode("utf-8", "replace").rstrip("\r") + "\n")
            sys.stdout.flush()


threading.Thread(target=reader, daemon=True).start()

# Lines arriving on stdin are messages to send to the board.
try:
    for line in sys.stdin:
        try:
            ser.write(line.rstrip("\n").encode("utf-8") + b"\n")
        except Exception:  # noqa: BLE001
            pass
except KeyboardInterrupt:
    pass
finally:
    try:
        ser.close()
    except Exception:  # noqa: BLE001
        pass
