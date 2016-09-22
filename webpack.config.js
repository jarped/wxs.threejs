var path = require('path');

module.exports = {
    entry: {
        Wxs3Map: './src/index.js'
    },
    output: {
        path: path.join(__dirname, 'bundles'),
        filename: '[name].bundle.js',
        publicPath: '/bundles/'
    },
     resolve: {
        extensions: ['', '.js'],
        modulesDirectories: ['web_modules', 'node_modules', 'bower_components']
    },
    module: {
        loaders: [
            {
                test: /.js$/,
                loader: 'babel-loader',
                exclude: /node_modules/,
                query: {
                    presets: ['es2015']
                }
            },
            {test: /\.json$/, loader: 'json-loader'}
        ]
    }
};
