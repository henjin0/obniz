# Sizuku THA BLE device

Library for [Sizuku THA](http://www.products.braveridge.com/sizuku-tha/) BLE device. This library is based on the specifications defined by Peripheral Device Link Profile. For more information on this protocol please visit [here](https://linkingiot.com/developer/LinkingProfile/device_profile.html).

![](./SizukuTHA.jpg)

This devices has 3 sensors, temperature, humidity and atmospheric pressure respectively. The sensor values are given one at a time so reading all 3 sensors might take a while.

## Usage

Using the obniz wired function we can get an instance of such an object. We need to pass the serial number as a parameter. This is mandatory and it allows the usage of multiple ble devices of same model. The serial number can be found taped on the battery holder, on the case or on the manual that comes with the device.

![](./Sizuku_serial.jpg)

```javascript
let sizukutha = obniz.wired('SizukuTHA', {serial:'0142095'});
```

Initialize connection as follows:

```javascript
await sizukutha.connectWait();
```

After this period we can get some initial sensor values with:

```javascript
sizukutha.getSensors()
```

We can update these sensor values by calling updateSensors and have the device deliver them in our callback. We define the callback as onSensorData and can be used as below:

```javascript
sizukutha.onSensorData = function(data) {
  console.log('Sizuku callback', data);
}
sizukutha.updateSensors();
```

We can use setInterval to update regularly. The return data is a dictionary in the form of 

```json
{
  'Temperature': 24.5
}
```

Data also can include more than one sensors depending on the capability of the device. **Sizuku THA** has 3 sensors so the output can look as below. 

```json
{
  'Temperature': 24.5,
  'Humidity': 51,
  'Atmospheric pressure': 1020,
}
```
---
**NOTE**
Temperature is reported in degrees Celsius.
Humidity is reported as percentage.
Atmospheric pressure is reported in mBar.

---