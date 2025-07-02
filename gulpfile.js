let gulp = require('gulp');
let gulpLoadPlugins = require('gulp-load-plugins');
let yargs = require('yargs');

let path;
let nodeNotifier;
let errorHandler;
let sass = require('gulp-sass')(require('sass'));


let argv = yargs.default({
	cache: true,
	debug: true,
	fix: false,
	minify: true,
	notify: true,
	open: true,
	port: 3000,
	spa: false,
	throwErrors: false,
}).argv;


let $ = gulpLoadPlugins({
	overridePattern: false,
	pattern: [
		'autoprefixer',
		'browser-sync',
		'connect-history-api-fallback',
		'cssnano',
		'emitty',
		'merge-stream',
		'postcss-reporter',
		'postcss-sass',
		'rollup',
		'rollup-plugin-babel',
		'rollup-plugin-commonjs',
		'rollup-plugin-node-resolve',
		'rollup-plugin-uglify',
		'stylelint',
		'vinyl-buffer',
	],
	scope: [
		'dependencies',
		'devDependencies',
		'optionalDependencies',
		'peerDependencies',
	],
});

if (argv.throwErrors) {
	errorHandler = false;
} else if (argv.notify) {
	errorHandler = $.notify.onError('<%= error.message %>');
} else {
	errorHandler = null;
}

function svgoConfig(minify = argv.minify) {
	return (file) => {
		if (!path) {
			// eslint-disable-next-line global-require
			path = require('path');
		}

		let filename = path.basename(file.relative, path.extname(file.relative));

		return {
			js2svg: {
				pretty: !minify,
				indent: '\t',
			},
			plugins: [
				{
					cleanupIDs: {
						minify: true,
						prefix: `${filename}-`,
					},
				},
				{
					removeTitle: true,
				},
				{
					sortAttrs: true,
				},
			],
		};
	};
}

function rollup(inputFile, outputFile) {
	let rollupPromise = $.rollup.rollup({
		input: inputFile,
		plugins: [
			$.rollupPluginNodeResolve({
				jsnext: true,
			}),
			$.rollupPluginCommonjs({
				include: 'node_modules/**',
			}),
			$.rollupPluginBabel({
				exclude: 'node_modules/**',
			}),
			argv.minify && $.rollupPluginUglify(),
		],
	}).then((bundle) => bundle.write({
		file: outputFile,
		format: 'iife',
		sourcemap: true,
	}));

	if (!argv.throwErrors) {
		rollupPromise.catch((error) => {
			if (argv.notify) {
				if (!nodeNotifier) {
					// eslint-disable-next-line global-require
					nodeNotifier = require('./node_modules/node-notifier');
				}

				nodeNotifier.notify({
					title: 'Error running Gulp',
					message: error.message,
					icon: './node_modules/gulp-notify/assets/gulp-error.png',
					sound: 'Frog',
				});
			}

			// eslint-disable-next-line no-console
			console.error(error.stack);
		});
	}

	return rollupPromise;
}

gulp.task('copy', () => {
	return gulp.src([
		'src/resources/**/*.*',
		'src/resources/**/.*',
		'!src/resources/**/.keep',
	], {
		base: 'src/resources',
		dot: true,
	})
		.pipe($.if(argv.cache, $.newer('build')))
		.pipe($.if(argv.debug, $.debug()))
		.pipe(gulp.dest('build'));
});

gulp.task('images', () => {
	return gulp.src('src/images/**/*.*')
		.pipe($.plumber({
			errorHandler,
		}))
		.pipe($.if(argv.cache, $.newer('build/images')))
		.pipe($.if(argv.debug, $.debug()))
		.pipe($.imagemin([
			$.imagemin.gifsicle({
				interlaced: true,
			}),
			$.imagemin.jpegtran({
				progressive: true,
			}),
			$.imagemin.optipng({
				optimizationLevel: 3,
			}),
			$.imagemin.svgo(svgoConfig()),
		]))
		.pipe(gulp.dest('build/images'));
});


gulp.task('svgSprites', () => {
	return gulp.src('src/images/sprites/svg/*.svg')
		.pipe($.plumber({
			errorHandler,
		}))
		.pipe($.if(argv.debug, $.debug()))
		.pipe($.svgmin(svgoConfig()))
		.pipe($.svgstore())
		.pipe($.if(!argv.minify, $.replace(/^\t+$/gm, '')))
		.pipe($.if(!argv.minify, $.replace(/\n{2,}/g, '\n')))
		.pipe($.if(!argv.minify, $.replace('?><!', '?>\n<!')))
		.pipe($.if(!argv.minify, $.replace('><svg', '>\n<svg')))
		.pipe($.if(!argv.minify, $.replace('><defs', '>\n\t<defs')))
		.pipe($.if(!argv.minify, $.replace('><symbol', '>\n<symbol')))
		.pipe($.if(!argv.minify, $.replace('></svg', '>\n</svg')))
		.pipe($.rename('sprites.svg'))
		.pipe(gulp.dest('build/images'));
});

gulp.task('svgOptimize', () => {
	return gulp.src('src/images/**/*.svg', {
		base: 'src/images',
	})
		.pipe($.plumber({
			errorHandler,
		}))
		.pipe($.if(argv.debug, $.debug()))
		.pipe($.svgmin(svgoConfig(false)))
		.pipe(gulp.dest('src/images'));
});

gulp.task('sass', () => {
	const postcssPlugins = [
		$.autoprefixer({
			grid: 'autoplace',
		}),
	];

	if (argv.minify) {
		postcssPlugins.push(
			$.cssnano({
				preset: [
					'default',
					{
						discardComments: {
							removeAll: true,
						},
					},
				],
			}),
		);
	}

	return gulp.src([
		'src/sass/*.scss',
		'!src/sass/_*.scss',
	])
		.pipe($.plumber({
			errorHandler,
		}))
		.pipe($.if(argv.debug, $.debug()))
		.pipe($.sourcemaps.init())
		.pipe(sass().on('error', sass.logError))
		.pipe($.postcss(postcssPlugins))
		.pipe($.sourcemaps.write('.'))
		.pipe(gulp.dest('build/css'));
});

gulp.task('jsMain', () => {
	return rollup('src/js/main.js', 'build/js/main.js');
});

gulp.task('lintsass', () => {
	return gulp.src([
		'src/sass/**/*.scss',
		'src/components/**/*.scss',
		'!src/sass/vendor/**/*.scss',
	])
		.pipe($.plumber({
			errorHandler,
		}))
		.pipe($.postcss([
			$.stylelint(),
			$.postcssReporter({
				clearReportedMessages: true,
				throwError: argv.throwErrors,
			}),
		], {
			parser: $.postcsssass,
		}));
});

gulp.task('lintJs', () => {
	return gulp.src([
		'*.js',
		'src/js/**/*.js',
		'!src/js/vendor/**/*.js',
	], {
		base: '.',
	})
		.pipe($.plumber({
			errorHandler,
		}))
		.pipe($.eslint({
			fix: argv.fix,
		}))
		.pipe($.eslint.format())
		.pipe($.if((file) => file.eslint && file.eslint.fixed, gulp.dest('.')));
});

gulp.task('watch', () => {
	gulp.watch([
		'src/resources/**/*.*',
		'src/resources/**/.*',
	], gulp.series('copy'));

	gulp.watch('src/images/**/*.*', gulp.series('images'));

	gulp.watch('src/*.html', gulp.series('html'));

	gulp.watch('src/images/sprites/svg/*.svg', gulp.series('svgSprites'));

	gulp.watch([
		'src/sass/**/*.scss'
	], gulp.series('sass'));

	gulp.watch([
		'src/js/**/*.js',
		'!src/js/vendor.js',
	], gulp.series('jsMain'));

});

gulp.task('serve', () => {
	let middleware = [];

	if (argv.spa) {
		middleware.push($.connectHistoryApiFallback());
	}

	$.browserSync
		.create()
		.init({
			notify: false,
			open: argv.open,
			port: argv.port,
			files: [
				'./build/**/*',
			],
			server: {
				baseDir: './build',
				middleware,
			},
		});
});

gulp.task('zip', () => {
	// eslint-disable-next-line global-require
	let name = require('./package').name;
	let now = new Date();
	let year = now.getFullYear().toString().padStart(2, '0');
	let month = (now.getMonth() + 1).toString().padStart(2, '0');
	let day = now.getDate().toString().padStart(2, '0');
	let hours = now.getHours().toString().padStart(2, '0');
	let minutes = now.getMinutes().toString().padStart(2, '0');

	return gulp.src([
		'build/**',
		'docs/**',
		'src/**',
		'.babelrc',
		'.editorconfig',
		'.eslintignore',
		'.eslintrc',
		'.gitignore',
		'.npmrc',
		'.stylelintrc',
		'*.js',
		'*.json',
		'*.md',
		'*.yml',
		'!zip/**',
	], {
		base: '.',
		dot: true,
	})
		.pipe($.zip(`${name}_${year}-${month}-${day}_${hours}-${minutes}.zip`))
		.pipe(gulp.dest('zip'));
});

gulp.task('html', function(){
    return gulp.src('src/*.html')
    .pipe(gulp.dest('build'))
});

gulp.task('build', gulp.parallel(
	'copy',
	'images',
	'svgSprites',
	'sass',
	'jsMain',
	'html'
));

gulp.task('lint', gulp.series(
	'lintsass',
	'lintJs'
));

gulp.task('default', gulp.series(
	'build',
	gulp.parallel(
		'watch',
		'serve'
	)
));
