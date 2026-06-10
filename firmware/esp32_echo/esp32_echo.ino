void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("HELLO FROM ESP32");
}

void loop() {
  if (Serial.available()) {
    String msg = Serial.readStringUntil('\n');
    Serial.print("RECEIVED: ");
    Serial.println(msg);
  }
}
