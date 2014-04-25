var database = require('../controllers/database');
var mongoose = require('mongoose');
var textSearch = require('mongoose-text-search');
var Source = require('./source');
var Query = require('./query');
var _ = require('underscore');

var schema = new mongoose.Schema({
  authoredAt: Date,
  fetchedAt: Date,
  storedAt: Date,
  timebox: Number,
  content: String,
  author: String,
  status: String,
  url: String,
  _source: {type: String, ref: 'Source'}
});

// Give the report schema text search capabilities
schema.plugin(textSearch);
// Add a text index to the `content` field
schema.index({content: 'text'});

schema.pre('save', function(next) {
  if (this.isNew) this._wasNew = true;
  var report = this;
  report.storedAt = Date.now();
  if (!report._source) return next();
  // Find actual source object and store it as a sub-document
  Source.findOne(report._source, function(err, source) {
    report._source = undefined;
    if (err || !source) return next(err);
    report._source = source._id;
    next();
  });
});

schema.post('save', function() {
  if (this._wasNew) schema.emit('report', {_id: this._id.toString()});
  else if (this.isModified('status')) schema.emit('report:status', {_id: this._id.toString(), status: this.status});
});

var Report = mongoose.model('Report', schema);

// Query reports based on passed query data
var QUERY_LIMIT = 20;
Report.queryReports = function(query, callback) {
  if (typeof query === 'function') return Report.find(query);
  if (query instanceof Query) query = query.normalize();

  query.limit = query.limit || QUERY_LIMIT;
  query.filter = {};

  // Return only newer results
  if (query.since) {
    query.filter.storedAt = query.filter.storedAt || {};
    query.filter.storedAt.$gte = query.since;
  }

  // Re-set search timestamp
  query.since = new Date;

  if (!query.keywords) {
    // Just use filters when no keywords are provided
    Report.find(query.filter, function(err, reports) {
      if (err) return callback(err);
      callback(null, reports);
    });
  } else {
    Report.textSearch(query.keywords, _.pick(query, ['filter', 'limit']), function(err, reports) {
      if (err) return callback(err);
      callback(null, _.pluck(reports.results, 'obj'));
    });
  }
};

module.exports = Report;
