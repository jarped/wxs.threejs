import * as _ from 'underscore';

var events = function () {

    var observers = {};

    return {
        on: function (event, callback, context) {
            if (!observers[event]) {
                observers[event] = [];
            }
            if (context) {
                callback = callback.bind(context);
            }
            observers[event].push(callback);
        },
        fire: function (event, data) {
            if (observers[event]) {
                _.each(observers[event], function (observer) {
                    observer(event, data);
                });
            }
        }
    };
};

export default events;