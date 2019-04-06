const path = require("path"),
	webpack = require("webpack");

module.exports = {
	entry: [ "./src/app.js" ],
	output: {
		filename: "bundle.js",
		path: path.resolve(__dirname, "web"),
		publicPath: "/web/"
	},
	/*plugins: [
		new webpack.optimize.UglifyJsPlugin({
			mangleProperties: {
		    	screw_ie8: false,
			},
			compress: {
				screw_ie8: false
			},
			output: {
				screw_ie8: false
			}
		})
	],*/
	module: {
		rules: [
			{
				test: /\.js$/,
				include: [
					path.resolve(__dirname, "src"),
					path.resolve(__dirname, "node_modules", "zerosense")
				],
				use: {
					loader: "babel-loader"
				}
			},
			{
				test: /\.js$/,
				enforce: "post",
				loader: "es3ify-loader"
			}
		]
	},
	resolve: {
		extensions: [ '.js' ]
	}
};