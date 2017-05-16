const gulp = require('gulp')
const sass = require('gulp-sass')
const minifyCSS = require('gulp-csso')

gulp.task('app', () => {
  return gulp.src('./styles/**/app.scss')
             .pipe(sass().on('error', sass.logError))
             .pipe(minifyCSS())
             .pipe(gulp.dest('./static/css'));
})

gulp.task('default', ['app'])
