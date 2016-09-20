import * as _ from 'underscore';

export default function createQueryString(params) {
    return _.map(params, function (value, key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(value);
    }).join('&');
}