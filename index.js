'use strict';

const Rx = require('rxjs');
const rxOps = require('rxjs/operators');
var Characteristic, Service;
const { FlicClient, FlicConnectionChannel } = require('./fliclib/fliclibNodeJs');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-flic', 'Flic', FlicButtonAccessory, false);
};


const BUTTON_UP = 'ButtonUp';
const BUTTON_DOWN = 'ButtonDown';

const createButtonObserver = flicConnectionChannel => observer => (
    flicConnectionChannel
        .on(
            'buttonUpOrDown',
            buttonPressState => observer.next(buttonPressState)
        )
)

const createButtonObservable = (flicConnectionChannel, customObserver) => (
    Rx.Observable
        .create(
            (customObserver || createButtonObserver)(flicConnectionChannel)
        )
)

const getNumberOfPresses = type => buttonPressStates => (
    buttonPressStates.filter(buttonPressState => buttonPressState === type).length
)

const getNumberOfDowns = getNumberOfPresses(BUTTON_DOWN)
const getNumberOfUps = getNumberOfPresses(BUTTON_UP)
const getPressType = ({ numDown, numUp }) => (
    numDown === numUp
        ? `${numDown}press`
        : `${numDown}pressHold`
)

const PRESS = {
    SINGLE: '1press',
    DOUBLE: '2press',
    TRIPLE: '3press',
    SINGLE_HOLD: '1pressHold',
    DOUBLE_HOLD: '2pressHold',
    TRIPLE_HOLD: '3pressHold',
}

function FlicButtonAccessory(log, config, api) {
    var accessory = this;
    this.log = log;
    this.config = config;
    this.mac = config.mac;
    this.name = config.name || 'Flic Button';
    this.protocol = config.protocol || 'all';
    this.isOn = false;

    this.infoService = new Service.AccessoryInformation();
    this.infoService
        .setCharacteristic(Characteristic.Manufacturer, 'Flic.')
        .setCharacteristic(Characteristic.Model, 'FlicButton')
        .setCharacteristic(Characteristic.SerialNumber, this.mac);

    this.switchService = new Service.Switch();
    this.switchService.setCharacteristic(Characteristic.On, this.isOn);
    this.switchService.getCharacteristic(Characteristic.On)
        .on('set', this.setState.bind(this))
        .on('get', this.getState.bind(this));


    const listenToButton = (flicClient) => bluetoothAddress => {

        const flicConnectionChannel = (
            new FlicConnectionChannel(
                bluetoothAddress,
                { latencyMode: 'LowLatency' }
            )
        )

        flicClient.addConnectionChannel(flicConnectionChannel)
        const handleButtonPresses = (bluetoothAddress) => numPressStates => {
            const pressType = getPressType(numPressStates);
            if (pressType === PRESS.SINGLE) {
                accessory.isOn = !accessory.isOn;
                accessory.switchService.setCharacteristic(Characteristic.On, accessory.isOn);
            }
        }

        const buttonUpDown$ = createButtonObservable(flicConnectionChannel)

        buttonUpDown$.pipe(
            rxOps.buffer(buttonUpDown$.pipe(rxOps.debounceTime(300))),
            rxOps.map(buttonPressStates => (
                buttonPressStates[0] === BUTTON_UP
                    ? buttonPressStates.slice(1)
                    : buttonPressStates
            )),
            rxOps.filter(buttonPressStates => buttonPressStates.length > 0),
            rxOps.map(buttonPressStates => ({
                numDown: getNumberOfDowns(buttonPressStates),
                numUp: getNumberOfUps(buttonPressStates),
            })))
            .subscribe(
                handleButtonPresses(bluetoothAddress)
            )
    }



    var flicClient = new FlicClient();
    flicClient.getInfo(info => {
        return info.bdAddrOfVerifiedButtons
            .map(listenToButton(flicClient))
    });

}

FlicButtonAccessory.prototype.identify = function (callback) {
    this.log('Identify requested!');
    callback();
};

FlicButtonAccessory.prototype.getServices = function () {
    return [this.infoService, this.switchService];
};

FlicButtonAccessory.prototype.getState = function (callback) {
    return callback(null, this.isOn);
};

FlicButtonAccessory.prototype.setState = function (value, callback) {
    this.isOn = value;
    callback();
};