'use strict';

var _ = require('lodash');
var path = require('path');
var async = require('async');
var ObjectID = require('mongodb').ObjectID;

module.exports = function (options) {
  var seneca = this;
  var plugin = 'cd-dojos';
  var ENTITY_NS = 'cd/dojos';
  var USER_DOJO_ENTITY_NS = "cd/usersdojos";
  var STATS_ENTITY_NS = "cd/stats";

  seneca.add({role: plugin, cmd: 'search'}, cmd_search);
  seneca.add({role: plugin, cmd: 'list'}, cmd_list);
  seneca.add({role: plugin, cmd: 'load'}, cmd_load);
  seneca.add({role: plugin, cmd: 'create'}, cmd_create);
  seneca.add({role: plugin, cmd: 'update'}, cmd_update);
  seneca.add({role: plugin, cmd: 'delete'}, cmd_delete);
  seneca.add({role: plugin, cmd: 'my_dojos_count'}, cmd_my_dojos_count);
  seneca.add({role: plugin, cmd: 'my_dojos_search'}, cmd_my_dojos_search);
  seneca.add({role: plugin, cmd: 'dojos_count'}, cmd_dojos_count);
  seneca.add({role: plugin, cmd: 'dojos_by_country'}, cmd_dojos_by_country);
  seneca.add({role: plugin, cmd: 'dojos_state_count'}, cmd_dojos_state_count);
  seneca.add({role: plugin, cmd: 'bulk_update'}, cmd_bulk_update);
  seneca.add({role: plugin, cmd: 'search_count'}, cmd_search_count);
  seneca.add({role: plugin, cmd: 'bulk_delete'}, cmd_bulk_delete);
  seneca.add({role: plugin, cmd: 'get_stats'}, cmd_get_stats);

  function cmd_search(args, done){
    

    var seneca = this, query = {}, dojos_ent;
    query = args.query;


    if(query.skip !== undefined){
      query.skip$ = query.skip;
      delete query.skip;
    }

    if(query.limit !== undefined){
      query.limit$ = query.limit;
      delete query.limit;
    }

    if(query.sort !== undefined){
      query.sort$ = query.sort;
      delete query.sort;
    }

    dojos_ent = seneca.make$(ENTITY_NS);
    dojos_ent.list$(query, done);
  }

  function cmd_search_count(args, done){
    var seneca = this, query = {}, dojos_ent;
    query = args.query;
    query.limit$ = 'NULL';
    dojos_ent = seneca.make$(ENTITY_NS);
    dojos_ent.list$(query, function(err, dojos){
      if(err){
        return done(err);
      }

      return done(null, {totalItems: dojos.length});
    });
  }

  function cmd_dojos_state_count(args, done) {
    var seneca = this;

    var country = args.country;
    var countData = {};
    
    seneca.make$(ENTITY_NS).list$({limit$:'NULL', alpha2:country}, function(err, response) {
      if(err) return done(err);
      countData[country] = {};
      _.each(response, function(dojo) {
        if(dojo.coordinates && dojo.deleted !== 1 && dojo.verified !== 0 && dojo.stage === 2) {
          if(!countData[dojo.alpha2][dojo.admin1Name]) countData[dojo.alpha2][dojo.admin1Name] = {total:0};
          countData[dojo.alpha2][dojo.admin1Name].total += 1;
          countData[dojo.alpha2][dojo.admin1Name].latitude = dojo.coordinates.split(',')[0];
          countData[dojo.alpha2][dojo.admin1Name].longitude = dojo.coordinates.split(',')[1];
        }
      });
      done(null, countData);
    });
      
  }

  function cmd_dojos_by_country(args, done) {
    var countries = args.countries;
    var dojos = [];
    async.each(Object.keys(countries), function(country, cb) {
      seneca.act({role:plugin, cmd:'list'}, {query:{alpha2:country}}, function(err, response) {
        if(err) return done(err);
        dojos.push(response);
        cb();
      });
    }, function() {
      dojos = _.sortBy(dojos, function(dojo) { return Object.keys(dojo)[0]; });
      done(null, dojos);
    });
  }

  function cmd_dojos_count(args, done) {
    var seneca = this;

    async.waterfall([
      getDojos,
      getCountries,
      getDojoCount
    ], done);

    function getDojos(done) {
      var dojos = [];
      var query = {limit$:'NULL'};
      seneca.make(ENTITY_NS).list$(query, function(err, response) {
        if(err) return response;
        async.each(response, function(dojo, cb) {
          if(dojo.deleted === 1 || dojo.verified === 0 || dojo.stage !== 2) return cb();
          dojos.push(dojo);
          cb();
        }, function() {
          done(null, dojos);
        });
      });
    }

    function getCountries(dojos, done) {
      seneca.act({role:'cd-countries', cmd:'countries_continents'}, function(err, response) {
        if(err) return done(err);
        done(null, dojos, response);
      });
    }

    function getDojoCount(dojos, countries, done) {
      var countData = {dojos:{continents:{}}};
      _.each(dojos, function(dojo) {
        if(countries.countries[dojo.alpha2]) {
          var continent = countries.countries[dojo.alpha2].continent;
          if(!countData.dojos.continents[continent]) countData.dojos.continents[continent] = {total:0, countries:{}};
          countData.dojos.continents[continent].total += 1;
          if(!countData.dojos.continents[continent].countries[dojo.alpha2]) countData.dojos.continents[continent].countries[dojo.alpha2] = {total:0};
          countData.dojos.continents[continent].countries[dojo.alpha2].total += 1;
        }
      });
      done(null, countData);
    }
  }

  function cmd_list(args, done) {
    var seneca = this, query = args.query || {};
    query.limit$ = 1500;
    seneca.make(ENTITY_NS).list$(query, function(err, response) {
      if(err) return done(err);
      var dojosByCountry = {};
      response = _.sortBy(response, 'countryName');
      _.each(response, function(dojo) {
        if(dojo.deleted !== 1 && dojo.verified !== 0 && dojo.stage === 2) {
          var id = dojo.id;
          if(!dojosByCountry[dojo.countryName]) {
            dojosByCountry[dojo.countryName] = {};
            dojosByCountry[dojo.countryName].states = {};
            if(!dojosByCountry[dojo.countryName].states[dojo.admin1Name]) dojosByCountry[dojo.countryName].states[dojo.admin1Name] = [];
            dojosByCountry[dojo.countryName].states[dojo.admin1Name].push(dojo);
          } else {
            if(!dojosByCountry[dojo.countryName].states[dojo.admin1Name]) dojosByCountry[dojo.countryName].states[dojo.admin1Name] = [];
            dojosByCountry[dojo.countryName].states[dojo.admin1Name].push(dojo);
          }
        }
      });

      var countries = Object.keys(dojosByCountry);
      _.each(countries, function(countryName) {
        var states = Object.keys(dojosByCountry[countryName].states);
        _.each(states, function(state) {
          dojosByCountry[countryName].states[state] = _.sortBy(dojosByCountry[countryName].states[state], function(dojo) { return dojo.name; } );
        });
      });
      
      done(null, dojosByCountry);
    });
  }

  function cmd_load(args, done) {
    var seneca = this;
    //TO DO: use correct id type
    var id = parseInt(args.id);
    seneca.make(ENTITY_NS).load$(id, function(err, response) {
      if(err) return done(err);
      done(null, response);
    });
  }

  function cmd_create(args, done){
    var seneca = this, dojo = args.dojo;
    var usersDojosEntity = seneca.make$(USER_DOJO_ENTITY_NS);
    var createdby = args.user;
    var userDojo = {};

    dojo.creator = createdby;
    seneca.make$(ENTITY_NS).save$(dojo, function(err, dojo) {
      if(err) return done(err);
      
      userDojo.owner = 1;
      userDojo.user_id = createdby;
      userDojo.dojo_id = dojo.id;
      
      usersDojosEntity.save$(userDojo, function(err, response) {
        if(err) return done(err);

        done(null, dojo);
      });
    });
  }

  function cmd_update(args, done){
    var seneca = this;
    var dojo = args.dojo;

    dojo.countryName = dojo.country;
    delete dojo.country;

    seneca.make(ENTITY_NS).save$(dojo, function(err, response) {
      if(err) return done(err);
      done(null, response);
    });
  }

  function cmd_delete(args, done){
    var seneca = this;
    var id = args.id;
    var creatorId;

    seneca.make$(ENTITY_NS).load$(id, function(err, dojo){
      if(err){
        done(err);
      }

      creatorId = dojo.creator;
      
      seneca.make$(ENTITY_NS).remove$(id, function(err){
        if(err){
          return done(err);
        }

        seneca.make$(USER_DOJO_ENTITY_NS).load$({user_id: creatorId, dojo_id: id}, function(err, userDojo){
          if(err){
            return done(err);
          }
          if(userDojo && userDojo.id){
            seneca.make$(USER_DOJO_ENTITY_NS).remove$(userDojo.id, function(err){
              if(err){
                return done(err);
              }

              done();
            });
          }
          else {
            done();
          }

        });

      });
    });

  }

  function cmd_bulk_update(args, done){
    var seneca = this;
    var dojos = args.dojos;

    var updateDojo = function(dojo, cb){
      seneca.act({role: plugin, cmd: 'update', dojo: dojo}, function(err, dojo){
        if(err){
          return cb(err);
        } 

        return cb();
      });
    };

    async.each(dojos, updateDojo, done);
  }

  function cmd_bulk_delete(args, done){
    var seneca = this;
    var dojos = args.dojos;


    function deleteDojo(dojo, cb){
      seneca.act({role: plugin, cmd: 'delete', id: dojo.id, creatorId: dojo.creator}, function(err){
        if(err){
          return cb(err);
        }

        cb();
      });
    }

    async.each(dojos, deleteDojo, done);
  }

  function cmd_my_dojos_count(args, done) {
    var seneca = this, query = {};
    var user = args.user;
    seneca.make$(USER_DOJO_ENTITY_NS).list$({user_id: user.id}, function(err, response){
      if(err){
        return done(err);
      }

      done(null, response.length);
    });
  }

  function cmd_my_dojos_search(args, done){
    var seneca = this, query = {};
    var user = args.user;
    var userObj = {};
    var dojoIds = [];
    
    query = args.query;


    if(query.skip !== undefined){
      query.skip$ = query.skip;
      delete query.skip;
    }

    if(query.limit !== undefined){
      query.limit$ = query.limit;
      delete query.limit;
    }

    if(query.sort !== undefined){
      query.sort$ = query.sort;
      delete query.sort;
    }


    seneca.make$(USER_DOJO_ENTITY_NS).list$({user_id: args.user.id}, function(err, response){
      if(err){
        return done(err);
      }

      if(query.name !== undefined) {
        query.name = new RegExp(query.name, 'i');
      }


      if(_.isEmpty(response)){
        return done(null, response);
      }

      dojoIds = _.pluck(response, 'dojoId');
      query.ids = dojoIds;


      seneca.make$(ENTITY_NS).list$(query, function(err, response) {
        if(err) return done(err);
        done(null, response);
      });
    });
  }

  function cmd_get_stats(args, done){
    var seneca = this;

    seneca.make(STATS_ENTITY_NS).list$({limit$: 'NULL'}, function(err, dojos){
      if(err){
        return done(err);
      }

      var dojoMappedByContinent = {};

      _.forEach(dojos, function(dojo){
        if(!dojoMappedByContinent[dojo.continent]){
          dojoMappedByContinent[dojo.continent] = [];
        } 
        
        dojoMappedByContinent[dojo.continent].push(dojo);
      });

      done(null, dojoMappedByContinent);

    });
  }

  return {
    name: plugin
  };

};