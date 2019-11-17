//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {

            initialize: function() {
                  var self = this;
                  if ( _.isUndefined( window.sektionsLocalizedData ) ) {
                        throw new Error( 'CZRSeksPrototype => missing localized server params sektionsLocalizedData' );
                  }
                  // this class is skope dependant
                  if ( ! _.isFunction( api.czr_activeSkopes ) ) {
                        throw new Error( 'CZRSeksPrototype => api.czr_activeSkopes' );
                  }
                  // SECTIONS ID FOR LOCAL AND GLOBAL OPTIONS
                  self.SECTION_ID_FOR_GLOBAL_OPTIONS = '__globalOptionsSectionId';
                  self.SECTION_ID_FOR_LOCAL_OPTIONS = '__localOptionsSection';

                  // SECTION ID FOR THE CONTENT PICKER
                  self.SECTION_ID_FOR_CONTENT_PICKER = '__content_picker__';

                  // Max possible number of columns in a section
                  self.MAX_NUMBER_OF_COLUMNS = 12;

                  // _.debounce param when updating the UI setting
                  // prevent hammering server + fixes https://github.com/presscustomizr/nimble-builder/issues/244
                  self.SETTING_UPDATE_BUFFER = 100;

                  // introduced for https://github.com/presscustomizr/nimble-builder/issues/403
                  self.TINYMCE_EDITOR_HEIGHT = 100;

                  // Define a default value for the sektion setting value, used when no server value has been sent
                  // @see php function
                  // function sek_get_default_location_model() {
                  //     $defaut_sektions_value = [ 'collection' => [], 'options' => [] ];
                  //     foreach( sek_get_locations() as $location ) {
                  //         $defaut_sektions_value['collection'][] = [
                  //             'id' => $location,
                  //             'level' => 'location',
                  //             'collection' => [],
                  //             'options' => []
                  //         ];
                  //     }
                  //     return $defaut_sektions_value;
                  // }
                  self.defaultLocalSektionSettingValue = self.getDefaultSektionSettingValue( 'local' );

                  // Store the contextual setting prefix
                  self.localSectionsSettingId = new api.Value( {} );

                  // Keep track of the registered ui elements dynamically registered
                  // this collection is populated in ::register(), if the track param is true
                  // this is used to know what ui elements are currently being displayed
                  self.registered = new api.Value([]);


                  api.bind( 'ready', function() {
                        self.doSektionThinksOnApiReady();
                  });//api.bind( 'ready' )

                  // Add the skope id on save
                  // Uses a WP core hook to filter the query on a customize_save action
                  //
                  // This posted skope id is useful when we need to know the skope id during ajax.
                  // ( Note that with the nimble ajax action, the skope_id is always posted. Not in WP core ajax actions. )
                  // Example of use of $_POST['local_skope_id'] => @see sek_get_parent_level_model()
                  // Helps fixing : https://github.com/presscustomizr/nimble-builder/issues/242, for which sek_add_css_rules_for_spacing() couldn't be set for columns margins
                  api.bind( 'save-request-params', function( query ) {
                        $.extend( query, { local_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ) } );
                  });

                  // added for https://github.com/presscustomizr/nimble-builder/issues/403
                  // in fmk::setupTinyMceEditor => each id of newly instantiated editor is added to the [] api.czrActiveWPEditors
                  // We need to remove those instances when cleaning registered controls
                  api.bind( 'sek-before-clean-registered', function() {
                        if ( _.isArray( api.czrActiveWPEditors ) ) {
                              _.each( api.czrActiveWPEditors, function( _id ) {
                                    wp.editor.remove( _id );
                              });
                              api.czrActiveWPEditors = [];
                        }
                  });
            },// initialize()


            // @ API READY
            // Fired at api.bind( 'ready', function() {})
            doSektionThinksOnApiReady : function() {
                  var self = this;
                  // the main sektion panel
                  // the local and global options section
                  self.registerAndSetupDefaultPanelSectionOptions();

                  // Setup the collection settings => register the main settings for local and global skope and bind it
                  // schedule reaction to collection setting ids => the setup of the collection setting when the collection setting ids are set
                  //=> on skope change
                  //@see setContextualCollectionSettingIdWhenSkopeSet
                  //
                  // var _settingsToRegister_ = {
                  //       'local' : { collectionSettingId : self.localSectionsSettingId() },//<= "nimble___[skp__post_page_10]"
                  //       'global' : { collectionSettingId : self.getGlobalSectionsSettingId() }//<= "nimble___[skp__global]"
                  // };
                  self.localSectionsSettingId.callbacks.add( function( collectionSettingIds, previousCollectionSettingIds ) {
                        // register the collection setting id
                        // and schedule the reaction to different collection changes : refreshModules, ...
                        try { self.setupSettingsToBeSaved(); } catch( er ) {
                              api.errare( 'Error in self.localSectionsSettingId.callbacks => self.setupSettingsToBeSaved()' , er );
                        }

                        // Now that the local and global settings are registered, initialize the history log
                        self.initializeHistoryLogWhenSettingsRegistered();

                        // On init and when skope changes, request the contextually active locations
                        // We should not need this call, because the preview sends it on initialize
                        // But this is safer.
                        // The preview send back the list of active locations 'sek-active-locations-in-preview'
                        // introduced for the level tree, https://github.com/presscustomizr/nimble-builder/issues/359
                        api.previewer.send('sek-request-active-locations');
                  });


                  // POPULATE THE MAIN SETTING ID NOW
                  // + GENERATE UI FOR THE LOCAL SKOPE OPTIONS
                  // + GENERATE UI FOR THE GLOBAL OPTIONS
                  var doSkopeDependantActions = function( newSkopes, previousSkopes ) {
                        self.setContextualCollectionSettingIdWhenSkopeSet( newSkopes, previousSkopes );

                        // Generate UI for the local skope options and the global options
                        api.section( self.SECTION_ID_FOR_LOCAL_OPTIONS, function( _section_ ) {
                              _section_.deferred.embedded.done( function() {
                                    if( true === _section_.boundForLocalOptionGeneration )
                                      return;
                                     // Defer the UI generation when the section is expanded
                                    _section_.boundForLocalOptionGeneration = true;
                                    _section_.expanded.bind( function( expanded ) {
                                          if ( true === expanded ) {
                                                self.generateUI({ action : 'sek-generate-local-skope-options-ui'});
                                          }
                                    });
                              });
                        });

                        // The UI of the global option must be generated only once.
                        // We don't want to re-generate on each skope change
                        // fixes https://github.com/presscustomizr/nimble-builder/issues/271
                        api.section( self.SECTION_ID_FOR_GLOBAL_OPTIONS, function( _section_ ) {
                              if ( true === _section_.nimbleGlobalOptionGenerated )
                                return;
                              self.generateUI({ action : 'sek-generate-global-options-ui'});
                              _section_.nimbleGlobalOptionGenerated = true;
                        });

                        // This event has been introduced when implementing https://github.com/presscustomizr/nimble-builder/issues/304
                        api.trigger('nimble-ready-for-current-skope');
                  };//doSkopeDependantActions()

                  // populate the setting ids now if skopes are set
                  if ( ! _.isEmpty( api.czr_activeSkopes().local ) ) {
                        doSkopeDependantActions();
                  }
                  // ON SKOPE READY
                  // - Set the contextual setting prefix
                  // - Generate UI for Nimble local skope options
                  // - Generate the content picker
                  api.czr_activeSkopes.callbacks.add( function( newSkopes, previousSkopes ) {
                        doSkopeDependantActions( newSkopes, previousSkopes );
                  });


                  // Communicate with the preview
                  self.reactToPreviewMsg();

                  // Setup Dnd
                  self.setupDnd();


                  // setup the tinyMce editor used for the tiny_mce_editor input
                  // => one object listened to by each tiny_mce_editor input
                  self.setupTinyMceEditor();

                  // print json
                  self.schedulePrintSectionJson();

                  // Always set the previewed device back to desktop on ui change
                  // event 'sek-ui-removed' id triggered when cleaning the registered ui controls
                  // @see ::cleanRegistered()
                  self.bind( 'sek-ui-removed', function() {
                        api.previewedDevice( 'desktop' );
                  });

                  // Synchronize api.previewedDevice with the currently rendered ui
                  // ensure that the selected device tab of the spacing module is the one being previewed
                  // =>@see spacing module, in item constructor CZRSpacingItemMths
                  api.previewedDevice.bind( function( device ) {
                        var currentControls = _.filter( self.registered(), function( uiData ) {
                              return 'control' == uiData.what;
                        });
                        _.each( currentControls || [] , function( ctrlData ) {
                              api.control( ctrlData.id, function( _ctrl_ ) {
                                    _ctrl_.container.find('[data-sek-device="' + device + '"]').each( function() {
                                          $(this).trigger('click');
                                    });
                              });
                        });
                  });

                  // Schedule a reset
                  $('#customize-notifications-area').on( 'click', '[data-sek-reset="true"]', function() {
                        api.previewer.trigger('sek-reset-collection', { scope : 'local' } );
                  });


                  // CLEAN UI BEFORE REMOVAL
                  // 'sek-ui-pre-removal' is triggered in ::cleanRegistered
                  // @params { what : control, id : '' }
                  self.bind( 'sek-ui-pre-removal', function( params ) {
                        // CLEAN DRAG N DROP
                        if ( 'control' == params.what && -1 < params.id.indexOf( 'draggable') ) {
                              api.control( params.id, function( _ctrl_ ) {
                                    _ctrl_.container.find( '[draggable]' ).each( function() {
                                          $(this).off( 'dragstart dragend' );
                                    });
                              });
                        }

                        // CLEAN SELECT2
                        // => we need to destroy the czrSelect2 instance, otherwise it can stay open when switching to another ui.
                        if ( 'control' == params.what ) {
                              api.control( params.id, function( _ctrl_ ) {
                                    _ctrl_.container.find( 'select' ).each( function() {
                                          if ( ! _.isUndefined( $(this).data('czrSelect2') ) ) {
                                                $(this).czrSelect2('destroy');
                                          }
                                    });
                              });
                        }
                  });


                  // POPULATE THE REGISTERED COLLECTION
                  // 'czr-new-registered' is fired in api.CZR_Helpers.register()
                  api.bind( 'czr-new-registered', function( params ) {
                        //console.log( 'czr-new-registered => ', params );
                        // Check that we have an origin property and that make sure we populate only the registration emitted by 'nimble'
                        if ( _.isUndefined( params.origin ) ) {
                              throw new Error( 'czr-new-registered event => missing params.origin' );
                        }
                        if ( 'nimble' !== params.origin )
                          return;

                        // when no collection is provided, we use
                        if ( false !== params.track ) {
                              var currentlyRegistered = self.registered();
                              var newRegistered = $.extend( true, [], currentlyRegistered );
                              //Check for duplicates
                              var duplicateCandidate = _.findWhere( newRegistered, { id : params.id } );
                              if ( ! _.isEmpty( duplicateCandidate ) && _.isEqual( duplicateCandidate, params ) ) {
                                    throw new Error( 'register => duplicated element in self.registered() collection ' + params.id );
                              }
                              newRegistered.push( params );
                              self.registered( newRegistered );

                              // say it
                              //this.trigger( [params.what, params.id , 'registered' ].join('__'), params );
                        }
                  });


                  // store active locations
                  // introduced for the level tree, https://github.com/presscustomizr/nimble-builder/issues/359
                  self.activeLocations = new api.Value([]);
                  api.previewer.bind('sek-active-locations-in-preview', function( activelocs ){
                        self.activeLocations( ( _.isObject(activelocs) && _.isArray( activelocs.active_locations ) ) ? activelocs.active_locations : [] );
                  });


                  // TOP BAR
                  // Setup the topbar including do/undo action buttons
                  self.setupTopBar();//@see specific dev file

                  // SAVE SECTION UI
                  if ( sektionsLocalizedData.isSavedSectionEnabled ) {
                        self.setupSaveUI();
                  }


                  // SETUP DOUBLE CLICK INSERTION THINGS
                  // Stores the preview target for double click insertion
                  // implemented for https://github.com/presscustomizr/nimble-builder/issues/317
                  self.lastClickedTargetInPreview = new api.Value();
                  self.lastClickedTargetInPreview.bind( function( to, from ) {
                        // to and from are formed this way : { id : "__nimble__fb2ab3e47472" }
                        // @see 'sek-pick-content' event in ::reactToPreviewMsg()

                        // Send the level id of the current double-click insertion target
                        // => this will be used to style the level id container with a pulse animation
                        if ( _.isObject( to ) && to.id ) {
                              api.previewer.send( 'sek-set-double-click-target', to );
                        } else {
                              // Tell the preview to clean the target highlight effect
                              api.previewer.send( 'sek-reset-double-click-target' );
                        }

                        // reset after a delay
                        clearTimeout( $(window).data('_preview_target_timer_') );
                        $(window).data('_preview_target_timer_', setTimeout(function() {
                              // Reset the click target
                              self.lastClickedTargetInPreview( {} );
                              // Tell the preview to clean the target highlight effect
                              api.previewer.send( 'sek-reset-double-click-target' );
                        }, 20000 ) );
                  });

                  // React to the preview to clean any currently highlighted drop zone
                  // This event is triggered on all click in the preview iframe
                  // @see preview::scheduleUiClickReactions()
                  api.previewer.bind( 'sek-clean-target-drop-zone', function() {
                        // Reset the click target
                        self.lastClickedTargetInPreview({});
                  });

                  // Clean the current target when hitting escape
                  $(document).keydown(function( evt ) {
                        // ESCAPE key pressed
                        if ( evt && 27 === evt.keyCode ) {
                            self.lastClickedTargetInPreview({});
                        }
                  });

                  // PRINT A WARNING NOTICE FOR USERS OF CACHE PLUGIN
                  if ( sektionsLocalizedData.hasActiveCachePlugin ) {
                        _.delay( function() {
                            api.previewer.trigger('sek-notify', {
                                  notif_id : 'has-active-cache-plugin',
                                  type : 'info',
                                  duration : 20000,
                                  message : [
                                        '<span style="color:#0075a2">',
                                          sektionsLocalizedData.i18n['You seem to be using a cache plugin.'],
                                          '<strong> (' + sektionsLocalizedData.hasActiveCachePlugin + ')</strong><br/>',
                                          '<strong>',
                                          sektionsLocalizedData.i18n['It is recommended to disable your cache plugin when customizing your website.'],
                                          '</strong>',
                                        '</span>'
                                  ].join('')
                            });
                        }, 2000 );//delay()
                  }
            },//doSektionThinksOnApiReady







            // Fired at api "ready"
            registerAndSetupDefaultPanelSectionOptions : function() {
                  var self = this;

                  // MAIN SEKTION PANEL
                  var SektionPanelConstructor = api.Panel.extend({
                        //attachEvents : function () {},
                        // Always make the panel active, event if we have no sections / control in it
                        isContextuallyActive : function () {
                          return this.active();
                        },
                        _toggleActive : function(){ return true; }
                  });

                  // Prepend the Nimble logo in the main panel title
                  // the panel.expanded() Value is not the right candidate to be observed because it gets changed on too many events, when generating the various UI.
                  api.panel( sektionsLocalizedData.sektionsPanelId, function( _mainPanel_ ) {
                        _mainPanel_.deferred.embedded.done( function() {
                              var $sidePanelTitleEl = _mainPanel_.container.find('h3.accordion-section-title'),
                                  $topPanelTitleEl = _mainPanel_.container.find('.panel-meta .accordion-section-title'),
                                  logoHtml = [ '<img class="sek-nimble-logo" alt="'+ _mainPanel_.params.title +'" src="', sektionsLocalizedData.baseUrl, '/assets/img/nimble/nimble_horizontal.svg?ver=' + sektionsLocalizedData.nimbleVersion , '"/>' ].join('');

                              if ( 0 < $sidePanelTitleEl.length ) {
                                    // The default title looks like this : Nimble Builder <span class="screen-reader-text">Press return or enter to open this section</span>
                                    // we want to style "Nimble Builder" only.
                                    var $sidePanelTitleElSpan = $sidePanelTitleEl.find('span');
                                    $sidePanelTitleEl
                                          .addClass('sek-side-nimble-logo-wrapper')
                                          .html( logoHtml )
                                          .append( $sidePanelTitleElSpan );
                              }

                              // default looks like
                              // <span class="preview-notice">You are customizing <strong class="panel-title">Nimble Builder</strong></span>
                              // if ( 0 < $topPanelTitleEl.length ) {
                              //       var $topPanelTitleElInner = $topPanelTitleEl.find('.panel-title');
                              //       $topPanelTitleElInner.html( logoHtml );
                              // }

                              if ( sektionsLocalizedData.eligibleForFeedbackNotification ) {
                                    _mainPanel_.expanded.bind( function( expanded ) {
                                          if ( expanded && _.isUndefined( self.feedbackUIVisible ) ) {
                                                // FEEDBACK UI
                                                self.setupFeedBackUI();
                                          }
                                    });
                              }
                        });
                  });

                  // The parent panel for all ui sections + global options section
                  api.CZR_Helpers.register({
                        origin : 'nimble',
                        what : 'panel',
                        id : sektionsLocalizedData.sektionsPanelId,//'__sektions__'
                        title: sektionsLocalizedData.i18n['Nimble Builder'],
                        priority : -1000,
                        constructWith : SektionPanelConstructor,
                        track : false,//don't register in the self.registered() => this will prevent this container to be removed when cleaning the registered
                  });


                  //GLOBAL OPTIONS SECTION
                  api.CZR_Helpers.register({
                        origin : 'nimble',
                        what : 'section',
                        id : self.SECTION_ID_FOR_GLOBAL_OPTIONS,
                        title: sektionsLocalizedData.i18n['Site wide options'],
                        panel : sektionsLocalizedData.sektionsPanelId,
                        priority : 20,
                        track : false,//don't register in the self.registered() => this will prevent this container to be removed when cleaning the registered
                        constructWith : api.Section.extend({
                              //attachEvents : function () {},
                              // Always make the section active, event if we have no control in it
                              isContextuallyActive : function () {
                                return this.active();
                              },
                              _toggleActive : function(){ return true; }
                        })
                  }).done( function() {
                        api.section( self.SECTION_ID_FOR_GLOBAL_OPTIONS, function( _section_ ) {
                              // Style the section title
                              var $sectionTitleEl = _section_.container.find('.accordion-section-title'),
                                  $panelTitleEl = _section_.container.find('.customize-section-title h3');

                              // The default title looks like this : Title <span class="screen-reader-text">Press return or enter to open this section</span>
                              if ( 0 < $sectionTitleEl.length ) {
                                    $sectionTitleEl.prepend( '<i class="fas fa-globe sek-level-option-icon"></i>' );
                              }

                              // The default title looks like this : <span class="customize-action">Customizing</span> Title
                              if ( 0 < $panelTitleEl.length ) {
                                    $panelTitleEl.find('.customize-action').after( '<i class="fas fa-globe sek-level-option-icon"></i>' );
                              }

                              // Schedule the accordion behaviour
                              self.scheduleModuleAccordion.call( _section_ );
                        });
                  });

                  //LOCAL OPTIONS SECTION
                  api.CZR_Helpers.register({
                        origin : 'nimble',
                        what : 'section',
                        id : self.SECTION_ID_FOR_LOCAL_OPTIONS,//<= the section id doesn't need to be skope dependant. Only the control id is skope dependant.
                        title: sektionsLocalizedData.i18n['Current page options'],
                        panel : sektionsLocalizedData.sektionsPanelId,
                        priority : 10,
                        track : false,//don't register in the self.registered() => this will prevent this container to be removed when cleaning the registered
                        constructWith : api.Section.extend({
                              //attachEvents : function () {},
                              // Always make the section active, event if we have no control in it
                              isContextuallyActive : function () {
                                return this.active();
                              },
                              _toggleActive : function(){ return true; }
                        })
                  }).done( function() {
                        api.section( self.SECTION_ID_FOR_LOCAL_OPTIONS, function( _section_ ) {
                              // Style the section title
                              var $sectionTitleEl = _section_.container.find('.accordion-section-title'),
                                  $panelTitleEl = _section_.container.find('.customize-section-title h3');

                              // The default title looks like this : Title <span class="screen-reader-text">Press return or enter to open this section</span>
                              if ( 0 < $sectionTitleEl.length ) {
                                    $sectionTitleEl.prepend( '<i class="fas fa-map-marker-alt sek-level-option-icon"></i>' );
                              }

                              // The default title looks like this : <span class="customize-action">Customizing</span> Title
                              if ( 0 < $panelTitleEl.length ) {
                                    $panelTitleEl.find('.customize-action').after( '<i class="fas fa-map-marker-alt sek-level-option-icon"></i>' );
                              }

                              // Schedule the accordion behaviour
                              self.scheduleModuleAccordion.call( _section_ );
                        });
                  });


                  // SITE WIDE GLOBAL OPTIONS SETTING
                  // Will Be updated in ::generateUIforGlobalOptions()
                  // has no control.
                  api.CZR_Helpers.register( {
                        origin : 'nimble',
                        //level : params.level,
                        what : 'setting',
                        id : sektionsLocalizedData.optNameForGlobalOptions,
                        dirty : false,
                        value : sektionsLocalizedData.globalOptionDBValues,
                        transport : 'postMessage',//'refresh',//// ,
                        type : 'option'
                  });


                  // CONTENT PICKER SECTION
                  api.CZR_Helpers.register({
                        origin : 'nimble',
                        what : 'section',
                        id : self.SECTION_ID_FOR_CONTENT_PICKER,
                        title: sektionsLocalizedData.i18n['Content Picker'],
                        panel : sektionsLocalizedData.sektionsPanelId,
                        priority : 30,
                        track : false,//don't register in the self.registered() => this will prevent this container to be removed when cleaning the registered
                        constructWith : api.Section.extend({
                              //attachEvents : function () {},
                              // Always make the section active, event if we have no control in it
                              isContextuallyActive : function () {
                                return this.active();
                              },
                              _toggleActive : function(){ return true; }
                        })
                  }).done( function() {
                        // generate the UI for the content picker if not done yet
                        // defer this action when the section is instantiated AND the api.previewer is active, so we can trigger event on it
                        // => we also need the local skope to be set, that's why api.czr_initialSkopeCollectionPopulated is convenient because it ensures the api.previewer is ready and we have a local skope set.
                        // @see czr-skope-base.js
                        // @fixes https://github.com/presscustomizr/nimble-builder/issues/187
                        api.section( self.SECTION_ID_FOR_CONTENT_PICKER, function( _section_ ) {
                              if ( 'resolved' != api.czr_initialSkopeCollectionPopulated.state() ) {
                                    api.czr_initialSkopeCollectionPopulated.done( function() {
                                          api.previewer.trigger('sek-pick-content', { focus : false });
                                    });
                              } else {
                                    api.previewer.trigger('sek-pick-content', { focus : false });
                              }
                        });
                  });
            },//registerAndSetupDefaultPanelSectionOptions()







            //@return void()
            // sektionsData is built server side :
            //array(
            //     'db_values' => sek_get_skoped_seks( $skope_id ),
            //     'setting_id' => sek_get_seks_setting_id( $skope_id )//nimble___[skp__post_page_home]
            // )
            setContextualCollectionSettingIdWhenSkopeSet : function( newSkopes, previousSkopes ) {
                  var self = this;
                  previousSkopes = previousSkopes || {};
                  // Clear all previous sektions if the main panel is expanded and we're coming from a previousSkopes
                  if ( ! _.isEmpty( previousSkopes.local ) && api.panel( sektionsLocalizedData.sektionsPanelId ).expanded() ) {
                        api.previewer.trigger('sek-pick-content');
                  }

                  // set the localSectionsSettingId now, and update it on skope change
                  sektionsData = api.czr_skopeBase.getSkopeProperty( 'sektions', 'local');
                  if ( sektionsLocalizedData.isDevMode ) {
                        api.infoLog( '::setContextualCollectionSettingIdWhenSkopeSet => SEKTIONS DATA ? ', sektionsData );
                  }
                  if ( _.isEmpty( sektionsData ) ) {
                        api.errare('::setContextualCollectionSettingIdWhenSkopeSet() => no sektionsData');
                  }
                  if ( _.isEmpty( sektionsData.setting_id ) ) {
                        api.errare('::setContextualCollectionSettingIdWhenSkopeSet() => missing setting_id');
                  }
                  self.localSectionsSettingId( sektionsData.setting_id );
            }
      });//$.extend()
})( wp.customize, jQuery );
//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // fired in ::initialize(), at api.bind( 'ready', function() {})
            setupTopBar : function() {
                  var self = this;
                  self.topBarId = '#nimble-top-bar';
                  self.topBarVisible = new api.Value( false );
                  self.topBarVisible.bind( function( visible ){
                        if ( ! self.levelTreeExpanded() ) {
                              self.toggleTopBar( visible );
                        }
                  });

                  self.mouseMovedRecently = new api.Value( {} );
                  self.mouseMovedRecently.bind( function( position ) {
                        self.topBarVisible( ! _.isEmpty( position )  );
                  });

                  var trackMouseMovements = function( evt ) {
                        self.mouseMovedRecently( { x : evt.clientX, y : evt.clientY } );
                        clearTimeout( $(window).data('_scroll_move_timer_') );
                        $(window).data('_scroll_move_timer_', setTimeout(function() {
                              self.mouseMovedRecently.set( {} );
                        }, 4000 ) );
                  };
                  $(window).on( 'mousemove scroll,', _.throttle( trackMouseMovements , 50 ) );
                  api.previewer.bind('ready', function() {
                        $(api.previewer.targetWindow().document ).on( 'mousemove scroll,', _.throttle( trackMouseMovements , 50 ) );
                  });

                  // LEVEL TREE
                  self.setupLevelTree();
            },


            // @return void()
            // self.topBarVisible.bind( function( visible ){
            //       self.toggleTopBar( visible );
            // });
            toggleTopBar : function( visible ) {
                  visible = _.isUndefined( visible ) ? true : visible;
                  var self = this,
                      _renderAndSetup = function() {
                            $.when( self.renderAndSetupTopBarTmpl({}) ).done( function( $_el ) {
                                  self.topBarContainer = $_el;
                                  //display
                                  _.delay( function() {
                                      $('body').addClass('nimble-top-bar-visible');
                                  }, 200 );
                            });
                      },
                      _hide = function() {
                            var dfd = $.Deferred();
                            $('body').removeClass('nimble-top-bar-visible');
                            if ( self.topBarContainer && self.topBarContainer.length ) {
                                  //remove Dom element after slide up
                                  _.delay( function() {
                                        //self.topBarContainer.remove();
                                        dfd.resolve();
                                  }, 300 );
                            } else {
                                dfd.resolve();
                            }
                            return dfd.promise();
                      };

                  if ( visible ) {
                        _renderAndSetup();
                  } else {
                        _hide().done( function() {
                              self.topBarVisible( false );//should be already false
                        });
                  }
            },


            //@param = { }
            renderAndSetupTopBarTmpl : function( params ) {
                  var self = this,
                      _tmpl;

                  // CHECK IF ALREADY RENDERED
                  if ( $( self.topBarId ).length > 0 )
                    return $( self.topBarId );

                  // RENDER
                  try {
                        _tmpl =  wp.template( 'nimble-top-bar' )( {} );
                  } catch( er ) {
                        api.errare( 'Error when parsing the the top note template', er );
                        return false;
                  }
                  $('#customize-preview').after( $( _tmpl ) );

                  // UNDO / REDO ON CTRL + Z / CTRL + Y EVENTS
                  $(document).keydown( function( evt ) {
                        if ( evt.ctrlKey && _.contains( [89, 90], evt.keyCode ) ) {
                              try { self.navigateHistory( 90 === evt.keyCode ? 'undo' : 'redo'); } catch( er ) {
                                    api.errare( 'Error when firing self.navigateHistory', er );
                              }
                        }
                  });


                  // CLICK EVENTS
                  // Attach click events
                  $('.sek-add-content', self.topBarId).on( 'click', function(evt) {
                        evt.preventDefault();
                        api.previewer.trigger( 'sek-pick-content', { content_type : 'module' });
                  });
                  $('.sek-level-tree', self.topBarId).on( 'click', function(evt) {
                        evt.preventDefault();
                        self.levelTreeExpanded(!self.levelTreeExpanded());
                  });
                  $('[data-nimble-history]', self.topBarId).on( 'click', function(evt) {
                        try { self.navigateHistory( $(this).data( 'nimble-history') ); } catch( er ) {
                              api.errare( 'Error when firing self.navigateHistory', er );
                        }
                  });
                  $('.sek-settings', self.topBarId).on( 'click', function(evt) {
                        // Focus on the Nimble panel
                        api.panel( sektionsLocalizedData.sektionsPanelId, function( _panel_ ) {
                              self.rootPanelFocus();
                              _panel_.focus();
                        });
                        // // Generate UI for the local skope options
                        // self.generateUI({ action : 'sek-generate-local-skope-options-ui'}).done( function() {
                        //       api.control( self.getLocalSkopeOptionId(), function( _control_ ) {
                        //             _control_.focus();
                        //       });
                        // });
                  });

                  $('.sek-nimble-doc', self.topBarId).on( 'click', function(evt) {
                        evt.preventDefault();
                        window.open($(this).data('doc-href'), '_blank');
                  });

                  // NOTIFICATION WHEN USING CUSTOM TEMPLATE
                  // implemented for https://github.com/presscustomizr/nimble-builder/issues/304
                  var maybePrintNotificationForUsageOfNimbleTemplate = function( templateSettingValue ) {
                        if ( $(self.topBarId).length < 1 )
                          return;
                        if ( _.isObject( templateSettingValue ) && templateSettingValue.local_template && 'default' !== templateSettingValue.local_template ) {
                              $(self.topBarId).find('.sek-notifications').html([
                                    '<span class="fas fa-info-circle"></span>',
                                    sektionsLocalizedData.i18n['This page uses a custom template.']
                              ].join(' '));
                        } else {
                              $(self.topBarId).find('.sek-notifications').html('');
                        }
                  };

                  var initOnSkopeReady = function() {
                        // Schedule notification rendering on init
                        // @see ::generateUIforLocalSkopeOptions()
                        api( self.localSectionsSettingId(), function( _localSectionsSetting_ ) {
                              var localSectionsValue = _localSectionsSetting_(),
                                  initialLocalTemplateValue = ( _.isObject( localSectionsValue ) && localSectionsValue.local_options && localSectionsValue.local_options.template ) ? localSectionsValue.local_options.template : null;
                              // on init
                              maybePrintNotificationForUsageOfNimbleTemplate( initialLocalTemplateValue );
                        });

                        // React to template changes
                        // @see ::generateUIforLocalSkopeOptions() for the declaration of self.getLocalSkopeOptionId() + '__template'
                        api( self.getLocalSkopeOptionId() + '__template', function( _set_ ) {
                              _set_.bind( function( to, from ) {
                                    maybePrintNotificationForUsageOfNimbleTemplate( to );
                              });
                        });
                  };

                  // fire now
                  initOnSkopeReady();
                  // and on skope change, when user navigates through the previewed pages
                  // 'nimble-ready-for-current-skope' declared in ::initialize()
                  api.bind('nimble-ready-for-current-skope', function() {
                        initOnSkopeReady();
                  });

                  return $( self.topBarId );
            }
      });//$.extend()
})( wp.customize, jQuery );
//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // Fired in ::initialize(), at api 'ready'
            // March 2019 : history log tracks local and global section settings
            // no tracking of the global option sektionsLocalizedData.optNameForGlobalOptions
            initializeHistoryLogWhenSettingsRegistered : function() {
                  var self = this;
                  // This api.Value() is bound in ::setupTopBar
                  self.historyLog = new api.Value([{
                        status : 'current',
                        value : {
                              'local' : api( self.localSectionsSettingId() )(),//<= "nimble___[skp__post_page_10]"
                              'global' : api(  self.getGlobalSectionsSettingId() )()
                        },
                        action : 'initial'
                  }]);
                  // LISTEN TO HISTORY LOG CHANGES AND UPDATE THE BUTTON STATE
                  self.historyLog.bind( function( newLog ) {
                        if ( _.isEmpty( newLog ) )
                          return;

                        var newCurrentKey = _.findKey( newLog, { status : 'current'} );
                        newCurrentKey = Number( newCurrentKey );
                        $( '#nimble-top-bar' ).find('[data-nimble-history]').each( function() {
                              if ( 'undo' === $(this).data('nimble-history') ) {
                                    $(this).attr('data-nimble-state', 0 >= newCurrentKey ? 'disabled' : 'enabled');
                              } else {
                                    $(this).attr('data-nimble-state', newLog.length <= ( newCurrentKey + 1 ) ? 'disabled' : 'enabled');
                              }
                        });
                  });
            },

            // React to a local or global setting change api( settingData.collectionSettingId )
            // =>populates self.historyLog() observable value
            // invoked in ::setupSettingsToBeSaved, if params.navigatingHistoryLogs !== true <=> not already navigating
            trackHistoryLog : function( sektionSetInstance, params ) {
                  var self = this,
                      _isGlobal = sektionSetInstance.id === self.getGlobalSectionsSettingId();

                  // Safety checks
                  // trackHistoryLog must be invoked with a try catch statement
                  if ( !_.isObject( params ) || !_.isFunction( self.historyLog ) || !_.isArray( self.historyLog() ) ) {
                        api.errare( 'params, self.historyLog() ', params, self.historyLog() );
                        throw new Error('trackHistoryLog => invalid params or historyLog value');
                  }

                  // Always clean future values if the logs have been previously navigated back
                  var newHistoryLog = [],
                      historyLog = $.extend( true, [], self.historyLog() ),
                      sektionToRefresh;

                  if ( ! _.isEmpty( params.in_sektion ) ) {//<= module changed, column resized, removed...
                        sektionToRefresh = params.in_sektion;
                  } else if ( ! _.isEmpty( params.to_sektion ) ) {// column moved /
                        sektionToRefresh = params.to_sektion;
                  }

                  // Reset all status but 'future' to 'previous'
                  _.each( historyLog, function( log ) {
                        var newStatus = 'previous';
                        if ( 'future' == log.status )
                          return;
                        $.extend( log, { status : 'previous' } );
                        newHistoryLog.push( log );
                  });
                  newHistoryLog.push({
                        status : 'current',
                        value : _isGlobal ? { global : sektionSetInstance() } : { local : sektionSetInstance() },
                        action : _.isObject( params ) ? ( params.action || '' ) : '',
                        sektionToRefresh : sektionToRefresh
                  });
                  self.historyLog( newHistoryLog );
            },



            // @param direction = string 'undo', 'redo'
            // @return void()
            // Fired on click in the topbar or when hitting ctrl z / y
            navigateHistory : function( direction ) {
                  var self = this,
                      historyLog = $.extend( true, [], self.historyLog() );
                  // log model
                  // {
                  //       status : 'current', 'previous', 'future'
                  //       value : {},
                  //       action : 'sek-add-column'
                  // }

                  // UPDATE THE SETTING VALUE
                  var previous,
                      current,
                      future,
                      newHistoryLog = [],
                      newSettingValue,
                      previousSektionToRefresh,
                      currentSektionToRefresh;

                  _.each( historyLog, function( log ) {
                        if ( ! _.isEmpty( newSettingValue ) ) {
                              return;
                        }
                        switch( log.status ) {
                              case 'previous' :
                                    previous = log;
                              break;
                              case 'current' :
                                    current = log;
                              break;
                              case 'future' :
                                    future = log;
                              break;
                        }
                        switch( direction ) {
                              case 'undo' :
                                    // the last previous is our new setting value
                                    if ( ! _.isEmpty( current ) && ! _.isEmpty( previous ) ) {
                                          newSettingValue = previous.value;
                                          previousSektionToRefresh = current.sektionToRefresh;
                                          currentSektionToRefresh = previous.sektionToRefresh;
                                    }
                              break;
                              case 'redo' :
                                    // the first future is our new setting value
                                    if ( ! _.isEmpty( future ) ) {
                                          newSettingValue = future.value;
                                          previousSektionToRefresh = current.sektionToRefresh;
                                          currentSektionToRefresh = future.sektionToRefresh;
                                    }
                              break;
                        }
                  });

                  // set the new setting Value
                  if( ! _.isUndefined( newSettingValue ) ) {
                        if ( ! _.isEmpty( newSettingValue.local ) ) {
                              api( self.localSectionsSettingId() )( self.validateSettingValue( newSettingValue.local, 'local' ), { navigatingHistoryLogs : true } );

                              // Clean and regenerate the local option setting
                              // Note that we also do it after a local import.
                              //
                              // Settings are normally registered once and never cleaned, unlike controls.
                              // Updating the setting value will refresh the sections
                              // but the local options, persisted in separate settings, won't be updated if the settings are not cleaned
                              // Example of local setting id :
                              // __nimble__skp__post_page_2__localSkopeOptions__template
                              // or
                              // __nimble__skp__home__localSkopeOptions__custom_css
                              api.czr_sektions.generateUI({
                                    action : 'sek-generate-local-skope-options-ui',
                                    clean_settings : true//<= see api.czr_sektions.generateUIforLocalSkopeOptions()
                              });
                        }
                        if ( ! _.isEmpty( newSettingValue.global ) ) {
                              api( self.getGlobalSectionsSettingId() )( self.validateSettingValue( newSettingValue.global, 'global' ), { navigatingHistoryLogs : true } );
                        }
                        // If the information is available, refresh only the relevant sections
                        // otherwise fallback on a full refresh
                        var previewHasBeenRefreshed = false;

                        // if ( ! _.isEmpty( previousSektionToRefresh ) ) {
                        //       api.previewer.trigger( 'sek-refresh-level', {
                        //             level : 'section',
                        //             id : previousSektionToRefresh
                        //       });
                        // } else {
                        //       api.previewer.refresh();
                        //       previewHasBeenRefreshed = true;
                        // }
                        // if ( currentSektionToRefresh != previousSektionToRefresh ) {
                        //     if ( ! _.isEmpty( currentSektionToRefresh ) ) {
                        //           api.previewer.trigger( 'sek-refresh-level', {
                        //                 level : 'section',
                        //                 id : currentSektionToRefresh
                        //           });
                        //     } else if ( ! previewHasBeenRefreshed ) {
                        //           api.previewer.refresh();
                        //     }
                        // }
                        api.previewer.refresh();

                        // Always make sure that the ui gets refreshed
                        api.previewer.trigger( 'sek-pick-content', {});

                        // Clean registered control
                        self.cleanRegistered();//<= normal cleaning
                        // Clean even the level settings
                        // => otherwise the level settings won't be synchronized when regenerating their ui.
                        self.cleanRegisteredLevelSettingsAfterHistoryNavigation();// setting cleaning
                  }

                  // UPDATE THE HISTORY LOG
                  var currentKey = _.findKey( historyLog, { status : 'current'} );
                  currentKey = Number( currentKey );
                  if ( ! _.isNumber( currentKey ) ) {
                        api.errare( 'Error when navigating the history log, the current key should be a number');
                        return;
                  }

                  _.each( historyLog, function( log, key ) {
                        newLog = $.extend( true, {}, log );
                        // cast keys to number so we can compare them
                        key = Number( key );
                        switch( direction ) {
                              case 'undo' :
                                    if ( 0 < currentKey ) {
                                          if ( key === ( currentKey - 1 ) ) {
                                                newLog.status = 'current';
                                          } else if ( key === currentKey ) {
                                                newLog.status = 'future';
                                          }
                                    }
                              break;
                              case 'redo' :
                                    if ( historyLog.length > ( currentKey + 1 ) ) {
                                          if ( key === currentKey ) {
                                                newLog.status = 'previous';
                                          } else if ( key === ( currentKey + 1 ) ) {
                                                newLog.status = 'current';
                                          }
                                    }
                              break;
                        }
                        newHistoryLog.push( newLog );
                  });
                  self.historyLog( newHistoryLog );
            }
      });//$.extend()
})( wp.customize, jQuery );
//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // fired in ::setupTopBar(), at api.bind( 'ready', function() {})
            setupLevelTree : function() {
                  var self = this;
                  self.levelTree = new api.Value([]);
                  self.levelTree.bind( function() {
                        // Refresh when the collection is being modified from the tree
                        if ( self.levelTreeExpanded() ) {
                              self.renderOrRefreshTree();
                        }
                  });


                  // SETUP AND REACT TO LEVEL TREE EXPANSION
                  self.levelTreeExpanded = new api.Value(false);
                  self.levelTreeExpanded.bind( function(expanded) {
                        $('body').toggleClass( 'sek-level-tree-expanded', expanded );
                        if ( expanded ) {
                              // Set the level tree now
                              self.setLevelTreeValue();

                              // Make sure we the tree is set first
                              if ( _.isEmpty( self.levelTree() ) ) {
                                    api.previewer.trigger('sek-notify', {
                                          type : 'info',
                                          duration : 10000,
                                          message : [
                                                '<span style="font-size:0.95em">',
                                                  '<strong>' + sektionsLocalizedData.i18n['No sections to navigate'] + '</strong>',
                                                '</span>'
                                          ].join('')
                                    });
                                    // self disable
                                    self.levelTreeExpanded(false);
                                    return;
                              }
                              $('#customize-preview iframe').css('z-index', 1);
                              self.renderOrRefreshTree();
                        } else if ( $('#nimble-level-tree').length > 0 ) {
                              _.delay( function() {
                                    $('#nimble-level-tree').remove();
                                    $('#customize-preview iframe').css('z-index', '');
                              }, 300 );
                        }
                  });

                  // REFRESH THE TREE WHEN THE ACTIVE LOCATIONS CHANGE
                  // @see ::initialize to understand how active locations are updated
                  self.activeLocations.bind(function() {
                        if ( !_.isEmpty( self.levelTree() ) ) {
                              self.renderOrRefreshTree();
                        }
                  });

                  // API READY
                  api.previewer.bind('ready', function() {
                        // LEVEL TREE
                        // on each skope change
                        // - set the level tree
                        // - bind the local and global settings so that they refresh the level tree when changed
                        self.localSectionsSettingId.callbacks.add( function() {
                              self.levelTreeExpanded(false);
                              // Bind the global and local settings if not bound yet
                              _.each( [ self.getGlobalSectionsSettingId(), self.localSectionsSettingId(), sektionsLocalizedData.optNameForGlobalOptions ], function( setId ){
                                    if ( api(setId)._isBoundForNimbleLevelTree )
                                      return;

                                    api(setId).bind( function(to) {
                                          self.setLevelTreeValue();
                                    });
                                    api(setId)._isBoundForNimbleLevelTree = true;
                              });
                        });
                  });



                  // SETUP CLICK EVENTS IN THE TREE
                  $('body').on('click', '#nimble-level-tree [data-nimb-level]', function(evt) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        var $el = $(evt.target),
                            $closestLevel = $el.closest('[data-nimb-level]');
                        api.previewer.send('sek-animate-to-level', { id : $closestLevel.data('nimb-id') });
                        api.previewer.send('sek-clean-level-uis');
                        // Display the level ui in the preview
                        // and expand the level options in the customizer control panel
                        _.delay( function() {
                              api.previewer.send('sek-display-level-ui', { id : $closestLevel.data('nimb-id') });

                              var _id = $closestLevel.data('nimb-id'),
                                  _level = $closestLevel.data('nimb-level');

                              if ( 'column' === _level || 'section' === _level ) {
                                    api.previewer.trigger('sek-edit-options', { id : _id, level : _level });
                              } else if ( 'module' === _level ) {
                                    api.previewer.trigger('sek-edit-module', { id : _id, level : _level });
                              }
                        }, 100 );
                  });

                  $('body').on('click', '#nimble-level-tree .sek-remove-level', function(evt) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        var $el = $(evt.target).closest('[data-nimb-level]');
                        api.previewer.trigger('sek-remove', {
                              level : $el.data('nimb-level'),
                              id : $el.data('nimb-id'),
                              location : $el.closest('[data-nimb-level="location"]').data('nimb-id'),
                              in_sektion : $el.closest('[data-nimb-level="section"]').data('nimb-id'),
                              in_column : $el.closest('[data-nimb-level="column"]').data('nimb-id')
                        });
                        $el.fadeOut('slow');
                        // Refresh
                        self.renderOrRefreshTree();
                  });

                  // Collapse tree ( also possible by clicking on the tree icon in the top Nimble bar )
                  $('body').on('click', '.sek-close-level-tree' , function(evt) {
                        evt.preventDefault();
                        self.levelTreeExpanded(false);
                  });
            },

            // This method updates the levelTree observable api.Value()
            setLevelTreeValue : function() {
                  var self = this,
                      globalCollSetId = self.getGlobalSectionsSettingId(),
                      localCollSetId = self.localSectionsSettingId(),
                      globalOptionSetId = sektionsLocalizedData.optNameForGlobalOptions,
                      globalColSetValue, localColSetValue,
                      globalCollection, localCollection,
                      rawGlobalOptionsValue,
                      missingDependantSettingId = false;

                  // Check if all dependant settings are registered
                  // we won't go further if any of the 3 setting id's is not yet registered
                  _.each( [globalCollSetId, localCollSetId, globalOptionSetId ], function( setId ) {
                        if ( !api.has(setId) ) {
                              missingDependantSettingId = setId;
                              return;
                        }
                  });

                  if ( false !== missingDependantSettingId ) {
                        api.errare( '::setLevelTreeValue => a setting id is not registered ');
                        return;
                  }

                  // Normalizes the setting values
                  globalColSetValue = api(globalCollSetId)();
                  globalCollection = _.isObject( globalColSetValue ) ? $.extend( true, {}, globalColSetValue ) : {};
                  globalCollection = ! _.isEmpty( globalCollection.collection )? globalCollection.collection : [];
                  globalCollection = _.isArray( globalCollection ) ? globalCollection : [];

                  localColSetValue = api(localCollSetId)();
                  localColSetValue = _.isObject( localColSetValue ) ? localColSetValue : {};
                  localCollection = $.extend( true, {}, localColSetValue );
                  localCollection = ! _.isEmpty( localCollection.collection ) ? localCollection.collection : [];
                  localCollection = _.isArray( localCollection ) ? localCollection : [];

                  var raw_col = _.union( globalCollection, localCollection ),
                      local_header_footer_value,
                      global_header_footer_value,
                      has_local_header_footer = false,
                      has_global_header_footer = false;

                  rawGlobalOptionsValue = api( globalOptionSetId )();
                  rawGlobalOptionsValue = _.isObject( rawGlobalOptionsValue ) ? rawGlobalOptionsValue : {};

                  // HEADER-FOOTER => do we have a header-footer set, local or global ?
                  // LOCAL
                  if ( localColSetValue.local_options && localColSetValue.local_options.local_header_footer ) {
                        local_header_footer_value = localColSetValue.local_options.local_header_footer['header-footer'];
                        has_local_header_footer = 'nimble_local' === local_header_footer_value;
                  }

                  // GLOBAL
                  // there can be a global header footer if
                  // 1) local is not set to 'nimble_local' or 'theme'
                  // and
                  // 2) the global option is set to 'nimble_global'
                  //
                  // OR when
                  // 1) local is set to 'nimble_global'
                  if ( rawGlobalOptionsValue.global_header_footer && !has_local_header_footer && 'theme' !== local_header_footer_value) {
                        global_header_footer_value = rawGlobalOptionsValue.global_header_footer['header-footer'];
                        has_global_header_footer = 'nimble_global' === global_header_footer_value || 'nimble_global' === local_header_footer_value;
                  }

                  var filteredCollection = $.extend( true, [], raw_col ),
                      header_loc,
                      footer_loc;

                  filteredCollection = _.filter( filteredCollection, function( loc, key ) {
                      return !_.contains( ['nimble_global_header', 'nimble_global_footer', 'nimble_local_header', 'nimble_local_footer'], loc.id );
                  });

                  // RE-ORGANIZE LOCATIONS SO THAT WE HAVE
                  // - header
                  // - content loc #1
                  // - content loc #2
                  // - ...
                  // - footer
                  var wrapContentLocationWithHeaderFoooterLocations = function( scope ) {
                        header_loc = _.findWhere(raw_col, {id:'nimble_' + scope + '_header'});
                        footer_loc = _.findWhere(raw_col, {id:'nimble_' + scope + '_footer'});
                        filteredCollection.unshift(header_loc);
                        filteredCollection.push(footer_loc);
                  };
                  if ( has_local_header_footer ) {
                        wrapContentLocationWithHeaderFoooterLocations('local');
                  } else if ( has_global_header_footer ) {
                        wrapContentLocationWithHeaderFoooterLocations('global');
                  }

                  // RE-ORDER LOCATIONS IN THE SAME ORDER AS THEY ARE IN THE DOM
                  // @see ::initialize to understand how active locations are updated
                  var contextuallyActiveLocactions = self.activeLocations(),
                      orderedCollection = [],
                      candidate;
                  if ( !_.isEmpty(contextuallyActiveLocactions) ) {
                        _.each( contextuallyActiveLocactions, function( loc ) {
                              candidate = _.findWhere(filteredCollection, {id:loc});
                              if( !_.isUndefined(candidate) ) {
                                    orderedCollection.push(candidate);
                              }
                        });
                  } else {
                        orderedCollection = filteredCollection;
                  }

                  // Store it now
                  self.levelTree( orderedCollection );
            },


            // print the tree
            renderOrRefreshTree : function() {
                  var self = this,
                      _tmpl;
                  if( $('#nimble-level-tree').length < 1 ) {
                        // RENDER
                        try {
                              _tmpl =  wp.template( 'nimble-level-tree' )( {} );
                        } catch( er ) {
                              api.errare( 'Error when parsing the the nimble-level-tree template', er );
                              return false;
                        }
                        $( '#customize-preview' ).after( $( _tmpl ) );
                  }
                  $('#nimble-level-tree').find('.sek-tree-wrap').html( self.getLevelTreeHtml() );
            },

            // recursive helper
            // return an html string describing the contextually printed sections
            getLevelTreeHtml : function( _col, level ) {
                  var self = this;
                  _col = _col || self.levelTree();

                  var levelType,
                      levelName,
                      _html,
                      skipLevel = false;

                  if ( !_.isArray( _col ) || _.isEmpty( _col ) ) {
                        api.errare('::buildLevelTree => invalid collection param', _col );
                        return _html;
                  }
                  var remove_icon_html = '<i class="material-icons sek-remove-level" title="'+ sektionsLocalizedData.i18n['Remove this element'] +'">delete_forever</i>';
                  _html = '<ul>';
                  _.each( _col, function( _level_param ) {
                        if ( _.isUndefined( _level_param.level ) ){
                              api.errare('::buildLevelTree => missing level property', _level_param );
                              return;
                        }
                        if ( _.isUndefined( _level_param.id ) ){
                              api.errare('::buildLevelTree => missing id property', _level_param );
                              return;
                        }

                        // Set some vars now
                        levelType = _level_param.level;
                        levelName = levelType;

                        // if the level is a location, is this location contextually active ?
                        // @see ::initialize to understand how active locations are updated
                        if ( 'location' === levelType ) {
                              skipLevel = !_.contains( self.activeLocations(), _level_param.id );
                        }

                        if ( !skipLevel ) {
                              //try to get the i18n level name, fall back on the level type
                              if ( sektionsLocalizedData.i18n[levelType] ) {
                                    levelName = sektionsLocalizedData.i18n[levelType];
                              }
                              if ( true === _level_param.is_nested ) {
                                    levelName = sektionsLocalizedData.i18n['nested section'];
                              }

                              remove_icon_html = 'location' !== levelType ? remove_icon_html : '';
                              _html += '<li data-nimb-level="'+levelType+'" data-nimb-id="'+_level_param.id+'">';

                                _html += '<div class="sek-level-infos"><div class="sek-inner-level-infos">';
                                  // add module type and icon
                                  if ( 'module' === levelType ) {
                                        _html += [
                                              self.getTreeModuleIcon( _level_param.module_type ),
                                              self.getTreeModuleTitle( _level_param.module_type )
                                        ].join(' ');
                                  }
                                  // add the rest of the html, common to all elements
                                  _html += [
                                        ' ',
                                        levelName,
                                        '( id :',
                                        _level_param.id,
                                        ')',
                                        remove_icon_html
                                  ].join(' ');
                                _html += '</div></div>';

                                if ( _.isArray( _level_param.collection ) && ! _.isEmpty( _level_param.collection ) ) {
                                      _html += self.getLevelTreeHtml( _level_param.collection, level );
                                }
                              _html += '</li>';
                        }//if ( !skipLevel )
                  });//_.each

                  _html += '</ul>';

                  return _html;
            },

            // the module icons can be
            // an svg file like Nimble__divider_icon.svg => in this case we build and return the full url
            // or a font_icon like '<i class="fab fa-wordpress-simple"></i>'
            getTreeModuleIcon : function( modType ) {
                  var _icon = {};
                  _.each( sektionsLocalizedData.moduleCollection, function( modData ) {
                        if ( !_.isEmpty( _icon ) )
                          return;
                        if ( modType === modData['content-id'] ) {
                              _icon = {
                                    svg : modData.icon ? sektionsLocalizedData.moduleIconPath + modData.icon : '',
                                    font : modData.font_icon ? modData.font_icon : ''
                              };
                        }
                  });
                  if ( !_.isEmpty( _icon.svg ) ) {
                        return '<img class="sek-svg-mod-icon" src="' + _icon.svg + '"/>';
                  } else if ( !_.isEmpty( _icon.font ) ) {
                        return _icon.font;
                  }
            },

            getTreeModuleTitle : function( modType ) {
                  var _title = {};
                  _.each( sektionsLocalizedData.moduleCollection, function( modData ) {
                        if ( !_.isEmpty( _title ) )
                          return;
                        if ( modType === modData['content-id'] ) {
                              _title = modData.title;
                        }
                  });
                  return _title;
            }
      });//$.extend()
})( wp.customize, jQuery );
//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // SAVE DIALOG BLOCK
            // fired in ::initialize()
            setupSaveUI : function() {
                  var self = this;
                  self.saveUIVisible = new api.Value( false );
                  self.saveUIVisible.bind( function( to, from, params ){
                        self.toggleSaveUI( to, params ? params.id : null );
                  });
            },


            // @return void()
            // self.saveUIVisible.bind( function( visible ){
            //       self.toggleSaveUI( visible );
            // });
            toggleSaveUI : function( visible, sectionId ) {
                  visible = _.isUndefined( visible ) ? true : visible;
                  var self = this,
                      _renderAndSetup = function() {
                            $.when( self.renderAndSetupSaveUITmpl({}) ).done( function( $_el ) {
                                  self.saveUIContainer = $_el;
                                  //display
                                  _.delay( function() {
                                      $('body').addClass('nimble-save-ui-visible');
                                  }, 200 );
                                  // set section id input value
                                  $('#sek-saved-section-id').val( sectionId );
                            });
                      },
                      _hide = function() {
                            var dfd = $.Deferred();
                            $('body').removeClass('nimble-save-ui-visible');
                            if ( $( '#nimble-top-save-ui' ).length > 0 ) {
                                  //remove Dom element after slide up
                                  _.delay( function() {

                                        self.saveUIContainer.remove();
                                        dfd.resolve();
                                  }, 300 );
                            } else {
                                dfd.resolve();
                            }
                            return dfd.promise();
                      };

                  if ( visible ) {
                        _renderAndSetup();
                  } else {
                        _hide().done( function() {
                              self.saveUIVisible( false );//should be already false
                        });
                  }
            },


            // @return a section model with clean ids
            // also removes the section properties "id" and "level", which are dynamically set when dragging and dropping
            // Example of section model before preprocessing
            // {
            //    collection: [{…}]
            //    id: "" //<= to remove
            //    level: "section" // <= to remove
            //    options: {bg: {…}}
            //    ver_ini: "1.1.8"
            // }
            preProcessSektion : function( sectionModel ) {
                  var self = this, sektionCandidate = self.cleanIds( sectionModel );
                  return _.omit( sektionCandidate, function( val, key ) {
                        return _.contains( ['id', 'level'], key );
                  });
            },


            //@param = { }
            renderAndSetupSaveUITmpl : function( params ) {
                  if ( $( '#nimble-top-save-ui' ).length > 0 )
                    return $( '#nimble-top-save-ui' );

                  var self = this;

                  try {
                        _tmpl =  wp.template( 'nimble-top-save-ui' )( {} );
                  } catch( er ) {
                        api.errare( 'Error when parsing the the top note template', er );
                        return false;
                  }
                  $('#customize-preview').after( $( _tmpl ) );

                  // Attach click events
                  $('.sek-do-save-section', '#nimble-top-save-ui').on( 'click', function(evt) {
                        evt.preventDefault();
                        var sectionModel = $.extend( true, {}, self.getLevelModel( $('#sek-saved-section-id').val() ) ),
                            sek_title = $('#sek-saved-section-title').val(),
                            sek_description = $('#sek-saved-section-description').val(),
                            sek_id = self.guid(),
                            sek_data = self.preProcessSektion(sectionModel);

                        if ( _.isEmpty( sek_title ) ) {
                            $('#sek-saved-section-title').addClass('error');
                            api.previewer.trigger('sek-notify', {
                                  type : 'error',
                                  duration : 10000,
                                  message : [
                                        '<span style="font-size:0.95em">',
                                          '<strong>@missi18n You need to set a title</strong>',
                                        '</span>'
                                  ].join('')

                            });
                            return;
                        }

                        $('#sek-saved-section-title').removeClass('error');

                        wp.ajax.post( 'sek_save_section', {
                              nonce: api.settings.nonce.save,
                              sek_title: sek_title,
                              sek_description: sek_description,
                              sek_id: sek_id,
                              sek_data: JSON.stringify( sek_data )
                        })
                        .done( function( response ) {
                              // response is {section_post_id: 436}
                              //self.saveUIVisible( false );
                              api.previewer.trigger('sek-notify', {
                                  type : 'success',
                                  duration : 10000,
                                  message : [
                                        '<span style="font-size:0.95em">',
                                          '<strong>@missi18n Your section has been saved.</strong>',
                                        '</span>'
                                  ].join('')
                              });
                        })
                        .fail( function( er ) {
                              api.errorLog( 'ajax sek_save_section => error', er );
                              api.previewer.trigger('sek-notify', {
                                  type : 'error',
                                  duration : 10000,
                                  message : [
                                        '<span style="font-size:0.95em">',
                                          '<strong>@missi18n You need to set a title</strong>',
                                        '</span>'
                                  ].join('')
                              });
                        });
                  });//on click

                  $('.sek-cancel-save', '#nimble-top-save-ui').on( 'click', function(evt) {
                        evt.preventDefault();
                        self.saveUIVisible(false);
                  });

                  return $( '#nimble-top-save-ui' );
            }
      });//$.extend()
})( wp.customize, jQuery );
//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // fired in ::initialize(),
            // at api.bind( 'ready', function() {})
            // at _mainPanel_.expanded.bind( ... )
            setupFeedBackUI : function() {
                  var self = this;
                  self.feedbackLastUserAction = 'none';//<= store the last click action
                  self.feedbackUIId = '#nimble-feedback';
                  self.feedbackUIVisible = new api.Value( false );
                  self.feedbackUIVisible.bind( function( visible ){
                        if ( ! self.levelTreeExpanded() ) {
                              self.toggleFeddBackUI( visible );
                        }
                        // Schedule a self closing of the feedback UI
                        if ( visible ) {
                              self.refreshSelfClosingTimer();
                        }
                  });
                  self.feedbackUIVisible( true );
            },

            // self close the feedback ui when conditions are met
            refreshSelfClosingTimer : function() {
                  var self = this;
                  clearTimeout( $(self.feedbackUIId).data('_feedback_user_action_timer_') );
                  $(self.feedbackUIId).data('_feedback_user_action_timer_', setTimeout(function() {
                        // => 'maybe_later', 'already_did', 'dismiss' are hiding the feedback ui, no worries
                        // => 'go_review', 'reporting_problem' => user should click on "already did" to dismiss
                        // all other states are intermediate and can trigger a self close
                        if ( ! _.contains( [ 'go_review', 'reporting_problem' ] , self.feedbackLastUserAction) ) {
                              self.feedbackUIVisible( false );
                        }
                  }, 60000 ) );
            },

            // @return void()
            // self.feedbackUIVisible.bind( function( visible ){
            //       self.toggleFeddBackUI( visible );
            // });
            toggleFeddBackUI : function( visible ) {
                  visible = _.isUndefined( visible ) ? true : visible;
                  var self = this,
                      _renderAndSetup = function() {
                            $.when( self.renderAndSetupFeedbackTmpl({}) ).done( function( $_el ) {
                                  //display
                                  _.delay( function() {
                                      $('body').addClass('nimble-feedback-ui-visible');
                                  }, 200 );
                            });
                      },
                      _hideAndRemove = function() {
                            var dfd = $.Deferred();
                            $('body').removeClass('nimble-feedback-ui-visible');
                            if ( $( self.feedbackUIId ).length > 0 ) {
                                  //remove Dom element after slide up
                                  _.delay( function() {
                                        $( self.feedbackUIId ).remove();
                                        dfd.resolve();
                                  }, 300 );
                            } else {
                                dfd.resolve();
                            }
                            return dfd.promise();
                      };

                  if ( visible ) {
                        _renderAndSetup();
                  } else {
                        _hideAndRemove().done( function() {
                              self.feedbackUIVisible( false );//should be already false
                        });
                  }
            },


            //@param = { }
            renderAndSetupFeedbackTmpl : function( params ) {
                  var self = this,
                      _tmpl;

                  // CHECK IF ALREADY RENDERED
                  if ( $( self.feedbackUIId ).length > 0 )
                    return $( self.feedbackUIId );

                  // RENDER
                  try {
                        _tmpl =  wp.template( 'nimble-feedback-ui' )( {} );
                  } catch( er ) {
                        api.errare( 'Error when parsing the the feedback template', er );
                        return false;
                  }
                  $('#customize-preview').after( $( _tmpl ) );

                  // SCHEDULE EVENTS
                  if ( self.feedbackEventsScheduled )
                    return;

                  // @see PHP constant NIMBLE_FEEDBACK_NOTICE_ID
                  var _feedbackNoticeId = $(self.feedbackUIId).data('sek-dismiss-pointer');

                  // @return $.Deferred
                  var doAjaxDismiss = function() {
                      // On dismissing the notice, make a POST request to store this notice with the dismissed WP pointers so it doesn't display again.
                      // @uses 'dismiss-wp-pointer' <= core action to store the dismissed admin notification in the wp_usermeta DB table
                      // WP already has the PHP callback for that in  wp-admin/includes/ajax-actions.php
                      // the array of dismissed pointers can be accessed server side with get_user_meta( get_current_user_id(), 'dismissed_wp_pointers', true );
                      wp.ajax.post( 'dismiss-wp-pointer', {
                            pointer: _feedbackNoticeId
                      }).fail( function( resp ) {
                            api.errare( 'ajax dismiss failure', resp );
                      });
                  };

                  // Attach event with delegation
                  $('body').on('click', '[data-sek-feedback-action]', function(evt) {
                        evt.preventDefault();

                        // On each click action, reset the timer
                        self.refreshSelfClosingTimer();

                        var _action = $(this).data('sek-feedback-action');

                        // store it
                        self.feedbackLastUserAction = _action;

                        switch( _action ) {
                              // Step one
                              case 'not_enjoying' :
                                    $(self.feedbackUIId).find('.sek-feedback-step-one').hide();
                                    $(self.feedbackUIId).find('.sek-feedback-step-two-not-enjoying').show();
                              break;
                              case 'enjoying' :
                                    $(self.feedbackUIId).find('.sek-feedback-step-one').hide();
                                    $(self.feedbackUIId).find('.sek-feedback-step-two-enjoying').show();
                              break;

                              // Step two negative
                              case 'reporting_problem' :
                                    window.open($(this).data('problem-href'), '_blank');
                                    //self.feedbackUIVisible( false );
                              break;

                              // Step two positive
                              case 'go_review' :
                                    window.open('https://wordpress.org/support/plugin/nimble-builder/reviews/?filter=5/#new-post', '_blank');
                              break;

                              // Can be clicked in all cases
                              case 'maybe_later' :
                                    self.feedbackUIVisible( false );
                                    wp.ajax.post( 'sek_postpone_feedback', {
                                          nonce: api.settings.nonce.save,
                                          transient_duration_in_days : 30
                                    }).fail( function( resp ) {
                                          api.errare( 'ajax dismiss failure', resp );
                                    });
                              break;

                              // Ajax dismiss action
                              case 'already_did' :
                                    $(self.feedbackUIId).find('.sek-feedback-step-two-not-enjoying').hide();
                                    $(self.feedbackUIId).find('.sek-feedback-step-two-enjoying').hide();
                                    $(self.feedbackUIId).find('.sek-feedback-step-three-thanks').show();
                                    _.delay( function() {
                                          self.feedbackUIVisible( false );
                                    }, 3000 );
                                    doAjaxDismiss();
                              break;
                              case 'dismiss' :
                                    self.feedbackUIVisible( false );
                                    doAjaxDismiss();
                              break;
                              default :
                                    api.errare('::renderAndSetupFeedbackTmpl => invalid action');
                              break;
                        }
                        //window.open($(this).data('doc-href'), '_blank');
                  });

                  // so we bind event only once
                  self.feedbackEventsScheduled = true;
                  return $( self.feedbackUIId );
            }//renderAndSetupFeedbackTmpl
      });//$.extend()
})( wp.customize, jQuery );
//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // the input id determine if we fetch the revision history of the local or global setting
            // @return a deferred promise
            // @params object : { is_local:bool} <= 'local_revisions' === input.id
            getRevisionHistory : function(params) {
                  return wp.ajax.post( 'sek_get_revision_history', {
                        nonce: api.settings.nonce.save,
                        skope_id : params.is_local ? api.czr_skopeBase.getSkopeProperty( 'skope_id' ) : sektionsLocalizedData.globalSkopeId
                  });
            },

            // @return void()
            // Fetches the_content and try to set the setting value through normalized ::updateAPISetting method
            // @params {
            //    is_local : bool//<= 'local_revisions' === input.id
            //    revision_post_id : int
            // }
            setSingleRevision : function(params) {
                  var self = this;
                  var _notify = function( message, type ) {
                        api.previewer.trigger('sek-notify', {
                              notif_id : 'restore-revision-error',
                              type : type || 'info',
                              duration : 10000,
                              message : [
                                    '<span style="">',
                                      '<strong>',
                                      message || '',
                                      '</strong>',
                                    '</span>'
                              ].join('')
                        });
                  };
                  wp.ajax.post( 'sek_get_single_revision', {
                        nonce: api.settings.nonce.save,
                        //skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),
                        revision_post_id : params.revision_post_id
                  }).done( function( revision_value ){
                        // If the setting value is unchanged, no need to go further
                        // is_local is decided with the input id => @see revision_history input type.
                        var setId = params.is_local ? self.localSectionsSettingId() : self.getGlobalSectionsSettingId();
                        if ( _.isEqual( api( setId )(), revision_value ) ) {
                              _notify( sektionsLocalizedData.i18n['This is the current version.'], 'info' );
                              return;
                        }
                        // api.infoLog( 'getSingleRevision response', revision_value );
                        // api.infoLog( 'Current val', api(self.localSectionsSettingId())() );
                        self.updateAPISetting({
                              action : 'sek-restore-revision',
                              is_global_location : !params.is_local,//<= will determine which setting will be updated,
                              // => self.getGlobalSectionsSettingId() or self.localSectionsSettingId()
                              revision_value : revision_value
                        }).done( function() {
                              //_notify( sektionsLocalizedData.i18n['The revision has been successfully restored.'], 'success' );
                              api.previewer.refresh();
                        }).fail( function( response ) {
                              api.errare( '::setSingleRevision error when firing ::updateAPISetting', response );
                              _notify( sektionsLocalizedData.i18n['The revision could not be restored.'], 'error' );
                        });
                        //api.previewer.refresh();
                  }).fail( function( response ) {
                        api.errare( '::setSingleRevision ajax error', response );
                        _notify( sektionsLocalizedData.i18n['The revision could not be restored.'], 'error' );
                  });
            }
      });//$.extend()
})( wp.customize, jQuery );
//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // Fired on api 'ready', in reaction to ::setContextualCollectionSettingIdWhenSkopeSet => ::localSectionsSettingId
            // 1) register the collection setting nimble___[{$skope_id}] ( ex : nimble___[skp__post_page_20] )
            // 2) validate that the setting is well formed before being changed
            // 3) schedule reactions on change ?
            // @return void()
            setupSettingsToBeSaved : function() {
                  var self = this,
                      serverCollection;

                  // maybe register the sektion_collection settings
                  var _settingsToRegister_ = {
                        'local' : { collectionSettingId : self.localSectionsSettingId() },//<= "nimble___[skp__post_page_10]"
                        'global' : { collectionSettingId : self.getGlobalSectionsSettingId() }//<= "nimble___[skp__global]"
                  };

                  _.each( _settingsToRegister_, function( settingData, localOrGlobal ) {
                        serverCollection = api.czr_skopeBase.getSkopeProperty( 'sektions', localOrGlobal ).db_values;
                        if ( _.isEmpty( settingData.collectionSettingId ) ) {
                              throw new Error( 'setupSettingsToBeSaved => the collectionSettingId is invalid' );
                        }
                        // if the collection setting is not registered yet
                        // => register it and bind it
                        // => ensure that it will be bound only once, because the setting are never unregistered
                        if ( ! api.has( settingData.collectionSettingId ) ) {
                              var __collectionSettingInstance__ = api.CZR_Helpers.register({
                                    what : 'setting',
                                    id : settingData.collectionSettingId,
                                    value : self.validateSettingValue( _.isObject( serverCollection ) ? serverCollection : self.getDefaultSektionSettingValue( localOrGlobal ), localOrGlobal ),
                                    transport : 'postMessage',//'refresh'
                                    type : 'option',
                                    track : false,//don't register in the self.registered()
                                    origin : 'nimble'
                              });


                              //if ( sektionsLocalizedData.isDevMode ) {}
                              api( settingData.collectionSettingId, function( sektionSetInstance ) {

                                    // Schedule reactions to a collection change
                                    sektionSetInstance.bind( _.debounce( function( newSektionSettingValue, previousValue, params ) {
                                          // api.infoLog( 'sektionSettingValue is updated',
                                          //       {
                                          //             newValue : newSektionSettingValue,
                                          //             previousValue : previousValue,
                                          //             params : params
                                          //       }
                                          // );

                                          // console.log('MAIN SETTING CHANGED', params );
                                          // console.log('NEW MAIN SETTING VALUE', newSektionSettingValue );


                                          // Track changes, if not already navigating the logs
                                          if ( !_.isObject( params ) || true !== params.navigatingHistoryLogs ) {
                                                try { self.trackHistoryLog( sektionSetInstance, params ); } catch(er) {
                                                      api.errare( 'setupSettingsToBeSaved => trackHistoryLog', er );
                                                }
                                          }

                                    }, 1000 ) );
                              });//api( settingData.collectionSettingId, function( sektionSetInstance ){}
                        }//if ( ! api.has( settingData.collectionSettingId ) ) {
                  });//_.each(

                  // global options for all collection setting of this skope_id
                  // loop_start, before_content, after_content, loop_end

                  // Global Options : section
                  // api.CZR_Helpers.register({
                  //       what : 'section',
                  //       id : sektionsLocalizedData.optPrefixForSektionGlobalOptsSetting,//'__sektions__'
                  //       title: 'Global Options',
                  //       priority : 1000,
                  //       constructWith : SektionPanelConstructor,
                  //       track : false//don't register in the self.registered()
                  // });

                  // // => register a control
                  // // Template
                  // api.CZR_Helpers.register({
                  //       what : 'control',
                  //       id : sektionsLocalizedData.sektionsPanelId,//'__sektions__'
                  //       title: 'Main sektions panel',
                  //       priority : 1000,
                  //       constructWith : SektionPanelConstructor,
                  //       track : false//don't register in the self.registered()
                  // });
            },// SetupSettingsToBeSaved()

            // Fired :
            // 1) when instantiating the setting
            // 2) on each setting change, as an override of api.Value::validate( to ) @see customize-base.js
            // 3) directly when navigating the history log
            // @return {} or null if did not pass the checks
            // @param scope = string, local or global
            validateSettingValue : function( valCandidate, scope ) {
                  if ( ! _.isObject( valCandidate ) ) {
                        api.errare('::validateSettingValue => validation error => the setting should be an object', valCandidate );
                        return null;
                  }
                  if ( _.isEmpty( scope ) || !_.contains(['local', 'global'], scope ) ) {
                        api.errare( '::validateSettingValue =>  invalid scope provided.', scope );
                        return;
                  }
                  var parentLevel = {},
                      errorDetected = false,
                      levelIds = [];
                  // walk the collections tree and verify it passes the various consistency checks
                  var _errorDetected_ = function( msg ) {
                        api.errare( msg , valCandidate );
                        api.previewer.trigger('sek-notify', {
                              type : 'error',
                              duration : 60000,
                              message : [
                                    '<span style="font-size:0.95em">',
                                      '<strong>' + msg + '</strong>',
                                      '<br>',
                                      sektionsLocalizedData.i18n['If this problem locks Nimble Builder, you can try resetting the sections of this page.'],
                                      '<br>',
                                      '<span style="text-align:center;display:block">',
                                        '<button type="button" class="button" aria-label="' + sektionsLocalizedData.i18n.Reset + '" data-sek-reset="true">' + sektionsLocalizedData.i18n.Reset + '</button>',
                                      '</span>',
                                    '</span>'
                              ].join('')

                        });
                        errorDetected = true;
                  };
                  var _checkWalker_ = function( level ) {
                      if ( errorDetected ) {
                            return;
                      }
                      if ( _.isUndefined( level ) && _.isEmpty( parentLevel ) ) {
                            // we are at the root level
                            level = $.extend( true, {}, valCandidate );
                            if ( _.isUndefined( level.id ) || _.isUndefined( level.level ) ) {
                                  // - there should be no 'level' property or 'id'
                                  // - there should be a collection of registered locations
                                  // - there should be no parent level defined
                                  if ( _.isUndefined( level.collection ) ) {
                                        _errorDetected_( 'validation error => the root level is missing the collection of locations' );
                                        return;
                                  }
                                  if ( ! _.isEmpty( level.level ) || ! _.isEmpty( level.id ) ) {
                                        _errorDetected_( 'validation error => the root level should not have a "level" or an "id" property' );
                                        return;
                                  }

                                  // the local setting is structured this way:
                                  // {
                                  //    collection : [],
                                  //    local_options : {},
                                  //    fonts : []
                                  // }
                                  //
                                  // global_options like sitewide header and footer are saved in a specific option => NIMBLE_OPT_NAME_FOR_GLOBAL_OPTIONS
                                  // the global setting is structured this way:
                                  // {
                                  //    collection : [],
                                  //    fonts : []
                                  // }
                                  // Make sure that there's no unauthorized option group at root level
                                  _.each( level, function( _opts, _opt_group_name) {
                                        switch( scope ) {
                                              case 'local' :
                                                    if( !_.contains( ['collection', 'local_options', 'fonts' ] , _opt_group_name ) ) {
                                                          _errorDetected_( 'validation error => unauthorized option group for local setting value => ' + _opt_group_name );
                                                          return;
                                                    }
                                              break;
                                              case 'global' :
                                                    if( !_.contains( ['collection', 'fonts' ] , _opt_group_name ) ) {
                                                          _errorDetected_( 'validation error => unauthorized option group for global setting value => ' + _opt_group_name );
                                                          return;
                                                    }
                                              break;
                                        }
                                  });


                                  // Walk the section collection
                                  _.each( valCandidate.collection, function( _l_ ) {
                                        // Set the parent level now
                                        parentLevel = level;
                                        // walk
                                        _checkWalker_( _l_ );
                                  });
                            }
                      } else {
                            // we have a level.
                            // - make sure we have at least the following properties : id, level

                            // ID
                            if ( _.isEmpty( level.id ) || ! _.isString( level.id )) {
                                  _errorDetected_('validation error => a ' + level.level + ' level must have a valid id' );
                                  return;
                            } else if ( _.contains( levelIds, level.id ) ) {
                                  _errorDetected_('validation error => duplicated level id : ' + level.id );
                                  return;
                            } else {
                                  levelIds.push( level.id );
                            }

                            // OPTIONS
                            // if ( _.isEmpty( level.options ) || ! _.isObject( level.options )) {
                            //       _errorDetected_('validation error => a ' + level.level + ' level must have a valid options property' );
                            //       return;
                            // }

                            // LEVEL
                            if ( _.isEmpty( level.level ) || ! _.isString( level.level ) ) {
                                  _errorDetected_('validation error => a ' + level.level + ' level must have a level property' );
                                  return;
                            } else if ( ! _.contains( [ 'location', 'section', 'column', 'module' ], level.level ) ) {
                                  _errorDetected_('validation error => the level "' + level.level + '" is not authorized' );
                                  return;
                            }

                            // - Unless we are in a module, there should be a collection property
                            // - make sure a module doesn't have a collection property
                            if ( 'module' == level.level ) {
                                  if ( ! _.isUndefined( level.collection ) ) {
                                        _errorDetected_('validation error => a module can not have a collection property' );
                                        return;
                                  }
                            } else {
                                  if ( _.isUndefined( level.collection ) ) {
                                        _errorDetected_( 'validation error => missing collection property for level => ' + level.level + ' ' + level.id );
                                        return;
                                  }
                            }

                            // a level should always have a version "ver_ini" property
                            if ( _.isUndefined( level.ver_ini ) ) {
                                  //_errorDetected_('validation error => a ' + level.level + ' should have a version property : "ver_ini"' );
                                  //return;
                                  api.errare( 'validateSettingValue() => validation error => a ' + level.level + ' should have a version property : "ver_ini"' );
                            }

                            // Specific checks by level type
                            switch ( level.level ) {
                                  case 'location' :
                                        if ( ! _.isEmpty( parentLevel.level ) ) {
                                              _errorDetected_('validation error => the parent of location ' + level.id +' should have no level set' );
                                              return;
                                        }
                                  break;

                                  case 'section' :
                                        if ( level.is_nested && 'column' != parentLevel.level ) {
                                              _errorDetected_('validation error => the nested section ' + level.id +' must be child of a column' );
                                              return;
                                        }
                                        if ( ! level.is_nested && 'location' != parentLevel.level ) {
                                              _errorDetected_('validation error => the section ' + level.id +' must be child of a location' );
                                              return;
                                        }
                                  break;

                                  case 'column' :
                                        if ( 'section' != parentLevel.level ) {
                                              _errorDetected_('validation error => the column ' + level.id +' must be child of a section' );
                                              return;
                                        }
                                  break;

                                  case 'module' :
                                        if ( 'column' != parentLevel.level ) {
                                              _errorDetected_('validation error => the module ' + level.id +' must be child of a column' );
                                              return;
                                        }
                                  break;
                            }

                            // If we are not in a module, keep walking the collections
                            if ( 'module' != level.level ) {
                                  _.each( level.collection, function( _l_ ) {
                                        // Set the parent level now
                                        parentLevel = $.extend( true, {}, level );
                                        if ( ! _.isUndefined( _l_ ) ) {
                                              // And walk sub levels
                                              _checkWalker_( _l_ );
                                        } else {
                                              _errorDetected_('validation error => undefined level ' );
                                        }
                                  });
                            }
                      }
                  };
                  _checkWalker_();

                  //api.infoLog('in ::validateSettingValue', valCandidate );
                  // if null is returned, the setting value is not set @see customize-base.js
                  return errorDetected ? null : valCandidate;
            },//validateSettingValue



            // triggered when clicking on [data-sek-reset="true"]
            // click event is scheduled in ::initialize()
            // Note : only the collection is set to self.getDefaultSektionSettingValue( 'local' )
            // @see php function which defines the defaults sek_get_default_location_model()
            resetCollectionSetting : function( scope ) {
                  var self = this;
                  if ( _.isEmpty( scope ) || !_.contains(['local', 'global'], scope ) ) {
                        throw new Error( 'resetCollectionSetting => invalid scope provided.', scope );
                  }
                  return $.extend( true, {}, self.getDefaultSektionSettingValue( scope ) );
            }
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // invoked on api('ready') from self::initialize()
            // update the main setting OR generate a UI in the panel
            // AND
            // always send back a confirmation to the preview, so we can fire the ajax actions
            // the message sent back is used in particular to
            // - always pass the location_skope_id, which otherwise would be impossible to get in ajax
            // - in a duplication case, to pass the the newly generated id of the cloned level
            reactToPreviewMsg : function() {
                  var self = this,
                      apiParams = {},
                      uiParams = {},
                      sendToPreview = true, //<= the default behaviour is to send a message to the preview when the setting has been changed
                      msgCollection = {
                            // A section can be added in various scenarios :
                            // - when clicking on the ( + ) Insert content => @see preview::scheduleUiClickReactions() => addContentButton
                            // - when adding a nested section to a column
                            // - when dragging a module in a 'between-sections' or 'in-empty-location' drop zone
                            //
                            // Note : if the target location level already has section(s), then the section is appended in ajax, at the right place
                            // Note : if the target location is empty ( is_first_section is true ), nothing is send to the preview when updating the api setting, and we refresh the location level. => this makes sure that we removes the placeholder printed in the previously empty location
                            'sek-add-section' : {
                                  callback : function( params ) {
                                        sendToPreview = ! _.isUndefined( params.send_to_preview ) ? params.send_to_preview : true;//<= when the level is refreshed when complete, we don't need to send to preview.
                                        uiParams = {};
                                        apiParams = {
                                              action : 'sek-add-section',
                                              id : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid(),
                                              location : params.location,
                                              in_sektion : params.in_sektion,
                                              in_column : params.in_column,
                                              is_nested : ! _.isEmpty( params.in_sektion ) && ! _.isEmpty( params.in_column ),
                                              before_section : params.before_section,
                                              after_section : params.after_section,
                                              is_first_section : params.is_first_section
                                        };
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        // When a section is created ( not duplicated )
                                        if ( params.apiParams.is_first_section ) {
                                              api.previewer.trigger( 'sek-refresh-level', {
                                                    level : 'location',
                                                    id :  params.apiParams.location
                                              });
                                        }
                                        api.previewer.trigger( 'sek-pick-content', {
                                              // the "id" param is added to set the target for double click insertion
                                              // implemented for https://github.com/presscustomizr/nimble-builder/issues/317
                                              id : params.apiParams ? params.apiParams.id : '',
                                              content_type : 'section'
                                        });
                                        api.previewer.send('sek-animate-to-level', { id : params.apiParams.id });
                                  }
                            },


                            'sek-add-column' : {
                                  callback : function( params ) {
                                        sendToPreview = true;
                                        uiParams = {};
                                        apiParams = {
                                              id : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid(),
                                              action : 'sek-add-column',
                                              in_sektion : params.in_sektion,
                                              autofocus : params.autofocus
                                        };
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        // When adding a section, a nested column is automatically added
                                        // We want to focus on the module picker in this case, that's why the autofocus is set to false
                                        // @see 'sek-add-section' action description
                                        if ( false !== params.apiParams.autofocus ) {
                                              api.previewer.trigger( 'sek-pick-content', {});
                                        }
                                  }
                            },
                            'sek-add-module' : {
                                  callback :function( params ) {
                                        sendToPreview = true;
                                        uiParams = {};
                                        apiParams = {
                                              id : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid(),
                                              action : 'sek-add-module',
                                              in_sektion : params.in_sektion,
                                              in_column : params.in_column,
                                              module_type : params.content_id,

                                              before_module : params.before_module,
                                              after_module : params.after_module
                                        };
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        api.previewer.trigger( 'sek-edit-module', {
                                              id : params.apiParams.id,
                                              level : 'module',
                                              in_sektion : params.apiParams.in_sektion,
                                              in_column : params.apiParams.in_column
                                        });
                                        // always update the root fonts property after a module addition
                                        // because there might be a google font specified in the starting value
                                        self.updateAPISetting({
                                              action : 'sek-update-fonts',
                                              is_global_location : self.isGlobalLocation( params.apiParams )
                                        });

                                        // Refresh the stylesheet to generate the css rules of the clone
                                        // api.previewer.send( 'sek-refresh-stylesheet', {
                                        //       location_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                        // });
                                        api.previewer.trigger('sek-refresh-stylesheet', {
                                              id : params.apiParams.in_column,
                                              location_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' )//<= send skope id to the preview so we can use it when ajaxing
                                        });
                                  }
                            },
                            'sek-remove' : {
                                  callback : function( params ) {
                                        sendToPreview = true;
                                        uiParams = {};
                                        switch( params.level ) {
                                              case 'section' :
                                                  var sektionToRemove = self.getLevelModel( params.id );
                                                  if ( 'no_match' === sektionToRemove ) {
                                                        api.errare( 'reactToPreviewMsg => sek-remove-section => no sektionToRemove matched' );
                                                        break;
                                                  }
                                                  apiParams = {
                                                        action : 'sek-remove-section',
                                                        id : params.id,
                                                        location : params.location,
                                                        in_sektion : params.in_sektion,
                                                        in_column : params.in_column,
                                                        is_nested : sektionToRemove.is_nested
                                                  };
                                              break;
                                              case 'column' :
                                                  apiParams = {
                                                        action : 'sek-remove-column',
                                                        id : params.id,
                                                        in_sektion : params.in_sektion
                                                  };
                                              break;
                                              case 'module' :
                                                  apiParams = {
                                                        action : 'sek-remove-module',
                                                        id : params.id,
                                                        in_sektion : params.in_sektion,
                                                        in_column : params.in_column
                                                  };
                                              break;
                                              default :
                                                  api.errare( '::reactToPreviewMsg => sek-remove => missing level ', params );
                                              break;
                                        }
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        api.previewer.trigger( 'sek-pick-content', {});
                                        // always update the root fonts property after a removal
                                        // because the removed level(s) might had registered fonts
                                        self.updateAPISetting({
                                              action : 'sek-update-fonts',
                                              is_global_location : self.isGlobalLocation( params.apiParams )
                                        });

                                        // When the last section of a location gets removed, make sure we refresh the location level, to print the sek-empty-location-placeholder
                                        if ( 'sek-remove-section' === params.apiParams.action ) {
                                              var locationLevel = self.getLevelModel( params.apiParams.location );
                                              if ( _.isEmpty( locationLevel.collection ) ) {
                                                    api.previewer.trigger( 'sek-refresh-level', {
                                                          level : 'location',
                                                          id :  params.apiParams.location
                                                    });
                                              }
                                        }
                                  }
                            },

                            'sek-move' : {
                                  callback  : function( params ) {
                                        sendToPreview = true;
                                        uiParams = {};
                                        switch( params.level ) {
                                              case 'section' :
                                                    apiParams = {
                                                          action : 'sek-move-section',
                                                          id : params.id,
                                                          is_nested : ! _.isEmpty( params.in_sektion ) && ! _.isEmpty( params.in_column ),
                                                          newOrder : params.newOrder,
                                                          from_location : params.from_location,
                                                          to_location : params.to_location
                                                    };
                                              break;
                                              case 'column' :
                                                    apiParams = {
                                                          action : 'sek-move-column',
                                                          id : params.id,
                                                          newOrder : params.newOrder,
                                                          from_sektion : params.from_sektion,
                                                          to_sektion : params.to_sektion,
                                                    };
                                              break;
                                              case 'module' :
                                                    apiParams = {
                                                          action : 'sek-move-module',
                                                          id : params.id,
                                                          newOrder : params.newOrder,
                                                          from_column : params.from_column,
                                                          to_column : params.to_column,
                                                          from_sektion : params.from_sektion,
                                                          to_sektion : params.to_sektion,
                                                    };
                                              break;
                                        }
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        switch( params.apiParams.action ) {
                                              case 'sek-move-section' :
                                                    api.previewer.trigger('sek-edit-options', {
                                                          id : params.apiParams.id,
                                                          level : 'section',
                                                          in_sektion : params.apiParams.id
                                                    });
                                                    // refresh location levels if the source and target location are differents
                                                    if ( params.apiParams.from_location != params.apiParams.to_location ) {
                                                          api.previewer.trigger( 'sek-refresh-level', {
                                                                level : 'location',
                                                                id :  params.apiParams.to_location
                                                          });
                                                          api.previewer.trigger( 'sek-refresh-level', {
                                                                level : 'location',
                                                                id :  params.apiParams.from_location
                                                          });
                                                    }
                                              break;
                                              case 'sek-move-column' :
                                                    api.previewer.trigger('sek-edit-options', {
                                                          id : params.apiParams.id,
                                                          level : 'column',
                                                          in_sektion : params.apiParams.in_sektion,
                                                          in_column : params.apiParams.in_column
                                                    });
                                              break;
                                              case 'sek-refresh-modules-in-column' :
                                                    api.previewer.trigger('sek-edit-module', {
                                                          id : params.apiParams.id,
                                                          level : 'module',
                                                          in_sektion : params.apiParams.in_sektion,
                                                          in_column : params.apiParams.in_column
                                                    });
                                              break;
                                        }
                                  }
                            },//sek-move


                            'sek-move-section-up' : {
                                  callback  : function( params ) {
                                        sendToPreview = false;
                                        uiParams = {};
                                        apiParams = {
                                              action : 'sek-move-section-up-down',
                                              direction : 'up',
                                              id : params.id,
                                              is_nested : ! _.isEmpty( params.in_sektion ) && ! _.isEmpty( params.in_column ),
                                              location : params.location,
                                              in_column : params.in_column//<= will be used when moving a nested section
                                        };
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        api.previewer.trigger( 'sek-refresh-level', {
                                              level : 'location',
                                              id :  params.apiParams.location
                                        });
                                  }
                            },

                            'sek-move-section-down' : {
                                  callback  : function( params ) {
                                        sendToPreview = false;
                                        uiParams = {};
                                        apiParams = {
                                              action : 'sek-move-section-up-down',
                                              direction : 'down',
                                              id : params.id,
                                              is_nested : ! _.isEmpty( params.in_sektion ) && ! _.isEmpty( params.in_column ),
                                              location : params.location,
                                              in_column : params.in_column//<= will be used when moving a nested section
                                        };
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        api.previewer.trigger( 'sek-refresh-level', {
                                              level : 'location',
                                              id :  params.apiParams.location
                                        });
                                  }
                            },

                            // the level will be cloned and walked to replace all ids by new one
                            // then the level clone id will be send back to the preview for the ajax rendering ( this is done in updateAPISetting() promise() )
                            'sek-duplicate' : {
                                  callback : function( params ) {
                                        sendToPreview = true;
                                        uiParams = {};
                                        switch( params.level ) {
                                              case 'section' :
                                                    apiParams = {
                                                          action : 'sek-duplicate-section',
                                                          id : params.id,
                                                          location : params.location,
                                                          in_sektion : params.in_sektion,
                                                          in_column : params.in_column,
                                                          is_nested : ! _.isEmpty( params.in_sektion ) && ! _.isEmpty( params.in_column )
                                                    };
                                              break;
                                              case 'column' :
                                                    apiParams = {
                                                          action : 'sek-duplicate-column',
                                                          id : params.id,
                                                          in_sektion : params.in_sektion,
                                                          in_column : params.in_column
                                                    };
                                              break;
                                              case 'module' :
                                                    apiParams = {
                                                          action : 'sek-duplicate-module',
                                                          id : params.id,
                                                          in_sektion : params.in_sektion,
                                                          in_column : params.in_column
                                                    };
                                              break;
                                        }
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        var idForStyleSheetRefresh;
                                        switch( params.apiParams.action ) {
                                              case 'sek-duplicate-section' :
                                                    api.previewer.trigger('sek-edit-options', {
                                                          id : params.apiParams.id,
                                                          level : 'section',
                                                          in_sektion : params.apiParams.id
                                                    });
                                                    idForStyleSheetRefresh = params.apiParams.location;
                                                    // Focus on the cloned level
                                                    api.previewer.send('sek-animate-to-level', { id : params.apiParams.id });
                                              break;
                                              case 'sek-duplicate-column' :
                                                    api.previewer.trigger('sek-edit-options', {
                                                          id : params.apiParams.id,
                                                          level : 'column',
                                                          in_sektion : params.apiParams.in_sektion,
                                                          in_column : params.apiParams.in_column
                                                    });
                                                    idForStyleSheetRefresh = params.apiParams.in_sektion;
                                              break;
                                              case 'sek-duplicate-module' :
                                                    api.previewer.trigger('sek-edit-module', {
                                                          id : params.apiParams.id,
                                                          level : 'module',
                                                          in_sektion : params.apiParams.in_sektion,
                                                          in_column : params.apiParams.in_column
                                                    });
                                                    idForStyleSheetRefresh = params.apiParams.in_column;
                                              break;
                                        }
                                        // Refresh the stylesheet to generate the css rules of the clone
                                        // api.previewer.send( 'sek-refresh-stylesheet', {
                                        //       location_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                        // });
                                        api.previewer.trigger('sek-refresh-stylesheet', {
                                              id : idForStyleSheetRefresh,
                                              location_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' )//<= send skope id to the preview so we can use it when ajaxing
                                        });

                                  }
                            },
                            'sek-resize-columns' : function( params ) {
                                  sendToPreview = true;
                                  uiParams = {};
                                  apiParams = params;
                                  return self.updateAPISetting( apiParams );
                            },

                            // @params {
                            //       drop_target_element : $(this),
                            //       position : _position,
                            //       before_section : $(this).data('sek-before-section'),
                            //       after_section : $(this).data('sek-after-section'),
                            //       content_type : event.originalEvent.dataTransfer.getData( "sek-content-type" ),
                            //       content_id : event.originalEvent.dataTransfer.getData( "sek-content-id" )
                            // }
                            'sek-add-content-in-new-sektion' : {
                                  callback : function( params ) {
                                        sendToPreview = ! _.isUndefined( params.send_to_preview ) ? params.send_to_preview : true;//<= when the level is refreshed when complete, we don't need to send to preview.
                                        uiParams = {};
                                        apiParams = params;
                                        apiParams.action = 'sek-add-content-in-new-sektion';
                                        apiParams.id = sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid();//we set the id here because it will be needed when ajaxing
                                        switch( params.content_type) {
                                              // When a module is dropped in a section + column structure to be generated
                                              case 'module' :
                                                    apiParams.droppedModuleId = sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid();//we set the id here because it will be needed when ajaxing
                                              break;

                                              // When a preset section is dropped
                                              case 'preset_section' :
                                                    api.previewer.send( 'sek-maybe-print-loader', { loader_located_in_level_id : params.location });
                                                    api.previewer.send( 'sek-maybe-print-loader', { fullPageLoader : true });
                                              break;
                                        }
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        switch( params.apiParams.content_type) {
                                              case 'module' :
                                                    api.previewer.trigger('sek-edit-module', {
                                                          level : 'module',
                                                          id : params.apiParams.droppedModuleId
                                                    });
                                              break;
                                              // Clean the full page loader if not autocleaned yet
                                              case 'preset_section' :
                                                    api.previewer.send( 'sek-clean-loader', { cleanFullPageLoader : true });
                                              break;
                                        }

                                        // Always update the root fonts property after a module addition
                                        // => because there might be a google font specified in the starting value or in a preset section
                                        self.updateAPISetting({
                                              action : 'sek-update-fonts',
                                              is_global_location : self.isGlobalLocation( params.apiParams )
                                        });

                                        // Refresh the stylesheet to generate the css rules of the clone
                                        // api.previewer.send( 'sek-refresh-stylesheet', {
                                        //       location_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                        // });

                                        // Use the location_skope_id provided if set, otherwise generate it
                                        var location_skope_id = params.location_skope_id;
                                        if ( _.isUndefined( location_skope_id ) ) {
                                              location_skope_id = true === params.is_global_location ? sektionsLocalizedData.globalSkopeId : api.czr_skopeBase.getSkopeProperty( 'skope_id' );
                                        }
                                        api.previewer.trigger('sek-refresh-stylesheet', {
                                              //id : params.apiParams.location,
                                              location_skope_id : location_skope_id,//<= send skope id to the preview so we can use it when ajaxing
                                              is_global_location : self.isGlobalLocation( params.apiParams )
                                        });

                                        // Refresh when a section is created ( not duplicated )
                                        if ( params.apiParams.is_first_section ) {
                                              api.previewer.trigger( 'sek-refresh-level', {
                                                    level : 'location',
                                                    id :  params.apiParams.location
                                              });
                                        }

                                        // Remove the sektion_to_replace when dropping a preset_section in an empty section ( <= the one to replace )
                                        if ( params.apiParams.sektion_to_replace ) {
                                              api.previewer.trigger( 'sek-remove', {
                                                    id : params.apiParams.sektion_to_replace,
                                                    location : params.apiParams.location,
                                                    in_column : params.apiParams.in_column,//needed when removing a nested column
                                                    level : 'section'
                                              });
                                        }

                                        // Refresh the stylesheet again after a delay
                                        // For the moment, some styling, like fonts are not
                                        // @todo fix => see why we need to do it.
                                        // _.delay( function() {
                                        //       // Refresh the stylesheet to generate the css rules of the module
                                        //       api.previewer.send( 'sek-refresh-stylesheet', {
                                        //             location_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                        //       });
                                        // }, 1000 );
                                  }
                            },


                            // @params {
                            //       drop_target_element : $(this),
                            //       position : _position,
                            //       before_section : $(this).data('sek-before-section'),
                            //       after_section : $(this).data('sek-after-section'),
                            //       content_type : event.originalEvent.dataTransfer.getData( "sek-content-type" ),
                            //       content_id : event.originalEvent.dataTransfer.getData( "sek-content-id" )
                            // }
                            'sek-add-preset-section-in-new-nested-sektion' : {
                                  callback : function( params ) {
                                        sendToPreview = false;//<= when the level is refreshed when complete, we don't need to send to preview.
                                        uiParams = {};
                                        apiParams = params;
                                        apiParams.action = 'sek-add-preset-section-in-new-nested-sektion';
                                        apiParams.id = sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid();//we set the id here because it will be needed when ajaxing
                                        api.previewer.send( 'sek-maybe-print-loader', { loader_located_in_level_id : params.location });
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        // Refresh the stylesheet to generate the css rules of the clone
                                        // api.previewer.send( 'sek-refresh-stylesheet', {
                                        //       location_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                        // });
                                        api.previewer.trigger('sek-refresh-stylesheet', {
                                              id : params.apiParams.in_sektion,
                                              location_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' )//<= send skope id to the preview so we can use it when ajaxing
                                        });

                                        // Always update the root fonts property after a module addition
                                        // => because there might be a google font specified in the starting value or in a preset section
                                        self.updateAPISetting({
                                              action : 'sek-update-fonts',
                                              is_global_location : self.isGlobalLocation( params.apiParams )
                                        });

                                        api.previewer.trigger( 'sek-refresh-level', {
                                              level : 'section',
                                              id :  params.apiParams.in_sektion
                                        });
                                  }
                            },







                            // GENERATE UI ELEMENTS
                            'sek-pick-content' : function( params ) {
                                  params = _.isObject(params) ? params : {};
                                  // Set the active content type here
                                  // This is used in api.czrInputMap.content_type_switcher()
                                  // Fixes issue https://github.com/presscustomizr/nimble-builder/issues/248
                                  api.czr_sektions.currentContentPickerType = api.czr_sektions.currentContentPickerType || new api.Value();
                                  api.czr_sektions.currentContentPickerType( params.content_type || 'module' );

                                  // Set the last clicked target element id now => will be used for double click insertion of module / section
                                  if ( _.isObject( params ) && params.id ) {
                                        // self reset after a moment.
                                        // @see CZRSeksPrototype::initialize
                                        // implemented for https://github.com/presscustomizr/nimble-builder/issues/317
                                        self.lastClickedTargetInPreview( { id : params.id } );
                                  }

                                  params = params || {};
                                  sendToPreview = true;
                                  apiParams = {};
                                  uiParams = {
                                        action : 'sek-generate-draggable-candidates-picker-ui',
                                        content_type : params.content_type || 'module',
                                        // <= the "was_triggered" param can be used to determine if we need to animate the picker control or not. @see ::generateUI() case 'sek-generate-draggable-candidates-picker-ui'
                                        // true by default, because this is the most common scenario ( when adding a section, a column ... )
                                        // but false when clicking on the + ui icon in the preview
                                        was_triggered : _.has( params, 'was_triggered' ) ? params.was_triggered : true,
                                        focus : _.has( params, 'focus' ) ? params.focus : true
                                  };
                                  return self.generateUI( uiParams );
                            },

                            'sek-edit-options' : function( params ) {
                                  sendToPreview = true;
                                  apiParams = {};
                                  if ( _.isEmpty( params.id ) ) {
                                        return $.Deferred( function() {
                                              this.reject( 'missing id' );
                                        });
                                  }
                                  uiParams = {
                                        action : 'sek-generate-level-options-ui',
                                        level : params.level,
                                        id : params.id,
                                        in_sektion : params.in_sektion,
                                        in_column : params.in_column,
                                        options : params.options || []
                                  };
                                  return self.generateUI( uiParams );
                            },
                            'sek-edit-module' : function( params ) {
                                  sendToPreview = true;
                                  apiParams = {};
                                  uiParams = {
                                        action : 'sek-generate-module-ui',
                                        level : params.level,
                                        id : params.id,
                                        in_sektion : params.in_sektion,
                                        in_column : params.in_column,
                                        options : params.options || []
                                  };
                                  return self.generateUI( uiParams );
                            },


                            // OTHER MESSAGE TYPES
                            // @params {
                            //  type : info, error, success
                            //  message : ''
                            //  duration : in ms
                            // }
                            'sek-notify' : function( params ) {
                                  sendToPreview = false;
                                  var notif_id = params.notif_id || 'sek-notify';

                                  // Make sure we clean the last printed notification
                                  if ( self.lastNimbleNotificationId ) {
                                        api.notifications.remove( self.lastNimbleNotificationId );
                                  }

                                  return $.Deferred(function() {
                                        api.panel( sektionsLocalizedData.sektionsPanelId, function( __main_panel__ ) {
                                              api.notifications.add( new api.Notification( notif_id, {
                                                    type: params.type || 'info',
                                                    message:  params.message,
                                                    dismissible: true
                                              }));

                                              self.lastNimbleNotificationId = notif_id;

                                              // Removed if not dismissed after 5 seconds
                                              _.delay( function() {
                                                    api.notifications.remove( notif_id );
                                              }, params.duration || 5000 );
                                        });
                                        // always pass the local or global skope of the currently customized location id when resolving the promise.
                                        // It will be send to the preview and used when ajaxing
                                        this.resolve({
                                              is_global_location : self.isGlobalLocation( params )
                                        });
                                  });
                            },

                            'sek-refresh-level' : function( params ) {
                                  sendToPreview = true;
                                  return $.Deferred(function(_dfd_) {
                                        apiParams = {
                                              action : 'sek-refresh-level',
                                              level : params.level,
                                              id : params.id
                                        };
                                        uiParams = {};
                                        // always pass the local or global skope of the currently customized location id when resolving the promise.
                                        // It will be send to the preview and used when ajaxing
                                        _dfd_.resolve({
                                              is_global_location : self.isGlobalLocation( params )
                                        });
                                  });
                            },

                            'sek-refresh-stylesheet' : function( params ) {
                                  sendToPreview = true;
                                  params = params || {};
                                  return $.Deferred(function(_dfd_) {
                                        apiParams = {id : params.id};
                                        uiParams = {};
                                        // always pass the local or global skope of the currently customized location id when resolving the promise.
                                        // It will be send to the preview and used when ajaxing
                                        _dfd_.resolve({
                                              is_global_location : self.isGlobalLocation( params )
                                        });
                                  });
                            },

                            'sek-toggle-save-section-ui' : function( params ) {
                                  sendToPreview = false;
                                  self.saveUIVisible( true, params );
                                  return $.Deferred(function(_dfd_) {
                                        apiParams = {
                                              // action : 'sek-refresh-level',
                                              // level : params.level,
                                              // id : params.id
                                        };
                                        uiParams = {};
                                        // always pass the local or global skope of the currently customized location id when resolving the promise.
                                        // It will be send to the preview and used when ajaxing
                                        _dfd_.resolve({
                                              is_global_location : self.isGlobalLocation( params )
                                        });
                                  });
                            },


                            // RESET
                            'sek-reset-collection' : {
                                  callback : function( params ) {
                                        sendToPreview = false;//<= when the level is refreshed when complete, we don't need to send to preview.
                                        uiParams = {};
                                        apiParams = params;
                                        apiParams.action = 'sek-reset-collection';
                                        apiParams.scope = params.scope;
                                        return self.updateAPISetting( apiParams );
                                  },
                                  complete : function( params ) {
                                        api.previewer.refresh();
                                        api.previewer.trigger('sek-notify', {
                                              notif_id : 'reset-success',
                                              type : 'success',
                                              duration : 8000,
                                              message : [
                                                    '<span>',
                                                      '<strong>',
                                                      sektionsLocalizedData.i18n['Reset complete'],
                                                      '</strong>',
                                                    '</span>'
                                              ].join('')
                                        });
                                  }
                            },
                      };//msgCollection

                  // Schedule the reactions
                  // May be send a message to the preview
                  _.each( msgCollection, function( callbackFn, msgId ) {
                        api.previewer.bind( msgId, function( params ) {
                              var _cb_;
                              if ( _.isFunction( callbackFn ) ) {
                                    _cb_ = callbackFn;
                              } else if ( _.isFunction( callbackFn.callback ) ) {
                                    _cb_ = callbackFn.callback;
                              } else {
                                   api.errare( '::reactToPreviewMsg => invalid callback for action ' + msgId );
                                   return;
                              }

                              try { _cb_( params )
                                    // the cloneId is passed when resolving the ::updateAPISetting() promise()
                                    // they are needed on level duplication to get the newly generated level id.
                                    .done( function( promiseParams ) {
                                          promiseParams = promiseParams || {};
                                          // Send to the preview
                                          if ( sendToPreview ) {
                                                api.previewer.send(
                                                      msgId,
                                                      {
                                                            location_skope_id : true === promiseParams.is_global_location ? sektionsLocalizedData.globalSkopeId : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                                            local_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),
                                                            apiParams : apiParams,
                                                            uiParams : uiParams,
                                                            cloneId : ! _.isEmpty( promiseParams.cloneId ) ? promiseParams.cloneId : false
                                                      }
                                                );
                                          } else {
                                                // if nothing was sent to the preview, trigger the '*_done' action so we can execute the 'complete' callback
                                                api.previewer.trigger( [ msgId, 'done' ].join('_'), { apiParams : apiParams, uiParams : uiParams } );
                                          }
                                          // say it
                                          self.trigger( [ msgId, 'done' ].join('_'), params );
                                    })
                                    .fail( function( er ) {
                                          api.errare( 'reactToPreviewMsg => error when firing ' + msgId, er );
                                          // api.panel( sektionsLocalizedData.sektionsPanelId, function( __main_panel__ ) {
                                          //       api.notifications.add( new api.Notification( 'sek-react-to-preview', {
                                          //             type: 'info',
                                          //             message:  er,
                                          //             dismissible: true
                                          //       } ) );

                                          //       // Removed if not dismissed after 5 seconds
                                          //       _.delay( function() {
                                          //             api.notifications.remove( 'sek-react-to-preview' );
                                          //       }, 5000 );
                                          // });
                                          api.previewer.trigger('sek-notify', {
                                                type : 'error',
                                                duration : 30000,
                                                message : [
                                                      '<span style="font-size:0.95em">',
                                                        '<strong>' + er + '</strong>',
                                                        '<br>',
                                                        sektionsLocalizedData.i18n['If this problem locks Nimble Builder, you can try resetting the sections of this page.'],
                                                        '<br>',
                                                        '<span style="text-align:center;display:block">',
                                                          '<button type="button" class="button" aria-label="' + sektionsLocalizedData.i18n.Reset + '" data-sek-reset="true">' + sektionsLocalizedData.i18n.Reset + '</button>',
                                                        '</span>',
                                                      '</span>'
                                                ].join('')

                                          });
                                    }); } catch( _er_ ) {
                                          api.errare( 'reactToPreviewMsg => error when receiving ' + msgId, _er_ );
                                    }
                          });
                  });


                  // Schedule actions when callback done msg is sent by the preview
                  _.each( msgCollection, function( callbackFn, msgId ) {
                        api.previewer.bind( [ msgId, 'done' ].join('_'), function( params ) {
                              if ( _.isFunction( callbackFn.complete ) ) {
                                    try { callbackFn.complete( params ); } catch( _er_ ) {
                                          api.errare( 'reactToPreviewMsg done => error when receiving ' + [msgId, 'done'].join('_') , _er_ );
                                    }
                              }
                        });
                  });
            },//reactToPreview();






            // Fired in initialized on api(ready)
            schedulePrintSectionJson : function() {
                  var self = this;
                  var popupCenter = function ( content ) {
                        w = 400;
                        h = 300;
                        // Fixes dual-screen position                         Most browsers      Firefox
                        var dualScreenLeft = ! _.isUndefined( window.screenLeft ) ? window.screenLeft : window.screenX;
                        var dualScreenTop = ! _.isUndefined( window.screenTop ) ? window.screenTop : window.screenY;

                        var width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
                        var height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;

                        var left = ((width / 2) - (w / 2)) + dualScreenLeft;
                        var top = ((height / 2) - (h / 2)) + dualScreenTop;
                        var newWindow = window.open("about:blank", null, 'scrollbars=yes, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);
                        var doc = newWindow.document;
                        doc.open("text/html");
                        doc.write( content );
                        doc.close();
                        // Puts focus on the newWindow
                        if (window.focus) {
                            newWindow.focus();
                        }
                  };

                  api.previewer.bind( 'sek-to-json', function( params ) {
                        var sectionModel = $.extend( true, {}, self.getLevelModel( params.id ) );
                        console.log( JSON.stringify( self.cleanIds( sectionModel ) ) );
                        //popupCenter( JSON.stringify( cleanIds( sectionModel ) ) );
                  });
            }//schedulePrintSectionJson
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // @params = {
            //    action : 'sek-generate-module-ui' / 'sek-generate-level-options-ui'
            //    level : params.level,
            //    id : params.id,
            //    in_sektion : params.in_sektion,
            //    in_column : params.in_column,
            //    options : params.options || []
            // }
            // @return promise()
            generateUI : function( params ) {
                  var self = this,
                      dfd = $.Deferred();

                  if ( _.isEmpty( params.action ) ) {
                        dfd.reject( 'generateUI => missing action' );
                  }

                  // REGISTER SETTING AND CONTROL
                  switch ( params.action ) {
                        // FRONT AND LEVEL MODULES UI
                        // The registered elements are cleaned (self.cleanRegistered()) in the callbacks,
                        // because we want to check if the requested UI is not the one already rendered, and fire a button-see-me animation if yes.
                        case 'sek-generate-module-ui' :
                              try{ dfd = self.generateUIforFrontModules( params, dfd ); } catch( er ) {
                                    api.errare( '::generateUI() => error', er );
                                    dfd = $.Deferred();
                              }
                        break;

                        case 'sek-generate-level-options-ui' :
                              try{ dfd = self.generateUIforLevelOptions( params, dfd ); } catch( er ) {
                                    api.errare( '::generateUI() => error', er );
                                    dfd = $.Deferred();
                              }
                        break;

                        // Possible content types :
                        // 1) module
                        // 2) preset_section
                        case 'sek-generate-draggable-candidates-picker-ui' :
                              // Clean previously generated UI elements
                              self.cleanRegistered();
                              try{ dfd = self.generateUIforDraggableContent( params, dfd ); } catch( er ) {
                                    api.errare( '::generateUI() => error', er );
                                    dfd = $.Deferred();
                              }
                        break;

                        // Fired in ::initialize()
                        case 'sek-generate-local-skope-options-ui' :
                              // Clean previously generated UI elements
                              self.cleanRegistered();
                              try{ dfd = self.generateUIforLocalSkopeOptions( params, dfd ); } catch( er ) {
                                    api.errare( '::generateUI() => error', er );
                                    dfd = $.Deferred();
                              }
                        break;

                        // Fired in ::initialize()
                        case 'sek-generate-global-options-ui' :
                              // Clean previously generated UI elements
                              self.cleanRegistered();
                              try{ dfd = self.generateUIforGlobalOptions( params, dfd ); } catch( er ) {
                                    api.errare( '::generateUI() => error', er );
                                    dfd = $.Deferred();
                              }
                        break;
                  }//switch

                  return 'pending' == dfd.state() ? dfd.resolve().promise() : dfd.promise();//<= we might want to resolve on focus.completeCallback ?
            },//generateUI()







            // @params = {
            //     uiParams : params,
            //     options_type : 'spacing',
            //     settingParams : {
            //           to : to,
            //           from : from,
            //           args : args
            //     }
            // }
            //
            // @param settingParams.args = {
            //  inputRegistrationParams : {
            //     id :,
            //     type :
            //     refresh_markup : bool
            //     refresh_stylesheet : bool
            //     refresh_fonts : bool
            //  }
            //  input_changed : input_id
            //  input_transport : 'inherit'/'postMessage',
            //  module : { items : [...]}
            //  module_id :
            //  not_preview_sent : bool
            //}
            //
            // Note 1 : this method must handle two types of modules :
            // 1) mono item modules, for which the settingParams.to is an object, a single item object
            // 2) multi-items modules, for which the settingParams.to is an array, a collection of item objects
            // How do we know that we are a in single / multi item module ?
            //
            // Note 2 : we must also handle several scenarios of module value update :
            // 1) mono-items and multi-items module => input change
            // 2) crud multi item => item added or removed => in this case some args are not passed, like params.settingParams.args.inputRegistrationParams
            updateAPISettingAndExecutePreviewActions : function( params ) {
                  if ( _.isEmpty( params.settingParams ) || ! _.has( params.settingParams, 'to' ) ) {
                        api.errare( 'updateAPISettingAndExecutePreviewActions => missing params.settingParams.to. The api main setting can not be updated', params );
                        return;
                  }
                  var self = this;

                  // NORMALIZE THE VALUE WE WANT TO WRITE IN THE MAIN SETTING
                  // 1) We don't want to store the default title and id module properties
                  // 2) We don't want to write in db the properties that are set to their default values
                  var rawModuleValue = params.settingParams.to,
                      moduleValueCandidate,// {} or [] if mono item of multi-item module
                      parentModuleType = null,
                      isMultiItemModule = false;

                  if ( _.isEmpty( params.settingParams.args ) || ! _.has( params.settingParams.args, 'moduleRegistrationParams' ) ) {
                        api.errare( 'updateAPISettingAndExecutePreviewActions => missing params.settingParams.args.moduleRegistrationParams The api main setting can not be updated', params );
                        return;
                  }

                  var _ctrl_ = params.settingParams.args.moduleRegistrationParams.control,
                      _module_id_ = params.settingParams.args.moduleRegistrationParams.id,
                      parentModuleInstance = _ctrl_.czr_Module( _module_id_ );

                  if ( ! _.isEmpty( parentModuleInstance ) ) {
                        parentModuleType = parentModuleInstance.module_type;
                        isMultiItemModule = parentModuleInstance.isMultiItem();
                  } else {
                        api.errare( 'updateAPISettingAndExecutePreviewActions => missing parentModuleInstance', params );
                  }



                  // The new module value can be a single item object if monoitem module, or an array of item objects if multi-item crud
                  // Let's normalize it
                  if ( ! isMultiItemModule && _.isObject( rawModuleValue ) ) {
                        moduleValueCandidate = self.normalizeAndSanitizeSingleItemInputValues( rawModuleValue, parentModuleType );
                  } else {
                        moduleValueCandidate = [];
                        _.each( rawModuleValue, function( item ) {
                              moduleValueCandidate.push( self.normalizeAndSanitizeSingleItemInputValues( item, parentModuleType ) );
                        });
                  }

                  // WHAT TO REFRESH IN THE PREVIEW ? Markup, stylesheet, font ?
                  // The action to trigger is determined by the changed input
                  // For the options of a level, the default action is to refresh the stylesheet.
                  // But we might need to refresh the markup in some cases. Like for example when a css class is added. @see the boxed-wide layout example
                  if ( _.isEmpty( params.defaultPreviewAction ) ) {
                        api.errare( 'updateAPISettingAndExecutePreviewActions => missing defaultPreviewAction in passed params. No action can be triggered to the api.previewer.', params );
                        return;
                  }
                  // Set the default value
                  var refresh_stylesheet = 'refresh_stylesheet' === params.defaultPreviewAction,//<= default action for level options
                      refresh_markup = 'refresh_markup' === params.defaultPreviewAction,//<= default action for module options
                      refresh_fonts = 'refresh_fonts' === params.defaultPreviewAction,
                      refresh_preview = 'refresh_preview' === params.defaultPreviewAction;

                  // Maybe set the input based value
                  var input_id = params.settingParams.args.input_changed;
                  var inputRegistrationParams;

                  // introduced when updating the new text editors
                  // https://github.com/presscustomizr/nimble-builder/issues/403
                  var refreshMarkupWhenNeededForInput = function() {
                        return inputRegistrationParams && _.isString( inputRegistrationParams.refresh_markup ) && 'true' !== inputRegistrationParams.refresh_markup && 'false' !== inputRegistrationParams.refresh_markup;
                  };

                  if ( ! _.isUndefined( input_id ) ) {
                        inputRegistrationParams = self.getInputRegistrationParams( input_id, parentModuleType );
                        if ( ! _.isUndefined( inputRegistrationParams.refresh_stylesheet ) ) {
                              refresh_stylesheet = Boolean( inputRegistrationParams.refresh_stylesheet );
                        }
                        if ( ! _.isUndefined( inputRegistrationParams.refresh_markup ) ) {
                              if ( refreshMarkupWhenNeededForInput() ) {
                                    refresh_markup = inputRegistrationParams.refresh_markup;
                              } else {
                                    refresh_markup = Boolean( inputRegistrationParams.refresh_markup );
                              }
                        }
                        if ( ! _.isUndefined( inputRegistrationParams.refresh_fonts ) ) {
                              refresh_fonts = Boolean( inputRegistrationParams.refresh_fonts );
                        }
                        if ( ! _.isUndefined( inputRegistrationParams.refresh_preview ) ) {
                              refresh_preview = Boolean( inputRegistrationParams.refresh_preview );
                        }
                  }

                  var _doUpdateWithRequestedAction = function() {
                        // GLOBAL OPTIONS CASE => SITE WIDE => WRITING IN A SPECIFIC OPTION, SEPARATE FROM THE SEKTION
                        if ( true === params.isGlobalOptions ) {
                              if ( _.isEmpty( params.options_type ) ) {
                                    api.errare( 'updateAPISettingAndExecutePreviewActions => error when updating the global options => missing options_type');
                                    return;
                              }
                              //api( sektionsLocalizedData.optNameForGlobalOptions )() is registered on ::initialize();
                              var rawGlobalOptions = api( sektionsLocalizedData.optNameForGlobalOptions )(),
                                  clonedGlobalOptions = $.extend( true, {}, _.isObject( rawGlobalOptions ) ? rawGlobalOptions : {} ),
                                  _valueCandidate = {};

                              // consider only the non empty settings for db
                              // booleans should bypass this check
                              _.each( moduleValueCandidate || {}, function( _val_, _key_ ) {
                                    // Note : _.isEmpty( 5 ) returns true when checking an integer,
                                    // that's why we need to cast the _val_ to a string when using _.isEmpty()
                                    if ( ! _.isBoolean( _val_ ) && _.isEmpty( _val_ + "" ) )
                                      return;
                                    _valueCandidate[ _key_ ] = _val_;
                              });

                              clonedGlobalOptions[ params.options_type ] = _valueCandidate;

                              // Set it
                              api( sektionsLocalizedData.optNameForGlobalOptions )( clonedGlobalOptions );

                              // REFRESH THE PREVIEW ?
                              if ( false !== refresh_preview ) {
                                    api.previewer.refresh();
                              }

                              // Refresh the font list now, before ajax stylesheet update
                              // So that the .fonts collection is ready server side
                              if ( true === refresh_fonts ) {
                                    var newFontFamily = params.settingParams.args.input_value;
                                    if ( ! _.isString( newFontFamily ) ) {
                                          api.errare( 'updateAPISettingAndExecutePreviewActions => font-family must be a string', newFontFamily );
                                          return;
                                    }

                                    // add it only if gfont
                                    if ( newFontFamily.indexOf('gfont') > -1 ) {
                                          self.updateGlobalGFonts( newFontFamily );
                                    }
                              }

                              // REFRESH THE STYLESHEET ?
                              if ( true === refresh_stylesheet ) {
                                    api.previewer.send( 'sek-refresh-stylesheet', {
                                          local_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),
                                          location_skope_id : sektionsLocalizedData.globalSkopeId
                                    });
                              }
                        } else {
                              // LEVEL OPTION CASE => LOCAL
                              return self.updateAPISetting({
                                    action : params.uiParams.action,// mandatory : 'sek-generate-level-options-ui', 'sek-generate-local-skope-options-ui',...
                                    id : params.uiParams.id,
                                    value : moduleValueCandidate,
                                    in_column : params.uiParams.in_column,//not mandatory
                                    in_sektion : params.uiParams.in_sektion,//not mandatory

                                    // specific for level options and local skope options
                                    options_type : params.options_type,// mandatory : 'layout', 'spacing', 'bg_border', 'height', ...

                                    settingParams : params.settingParams
                              }).done( function( promiseParams ) {
                                    // STYLESHEET => default action when modifying the level options
                                    if ( true === refresh_stylesheet ) {
                                          api.previewer.send( 'sek-refresh-stylesheet', {
                                                location_skope_id : true === promiseParams.is_global_location ? sektionsLocalizedData.globalSkopeId : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                                local_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                                apiParams : {
                                                      action : 'sek-refresh-stylesheet',
                                                      id : params.uiParams.id,
                                                      level : params.uiParams.level
                                                },
                                          });
                                    }


                                    // MARKUP
                                    // since https://github.com/presscustomizr/nimble-builder/issues/403, 2 cases :
                                    // 1) update simply by postMessage, without ajax action <= refresh_markup is a string of selectors, and the content does not include content that needs server side parsing, like shortcode or template tages
                                    // 2) otherwise => update the level with an ajax refresh action
                                    var _sendRequestForAjaxMarkupRefresh = function() {
                                          api.previewer.send( 'sek-refresh-level', {
                                                location_skope_id : true === promiseParams.is_global_location ? sektionsLocalizedData.globalSkopeId : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                                local_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                                apiParams : {
                                                      action : 'sek-refresh-level',
                                                      id : params.uiParams.id,
                                                      level : params.uiParams.level
                                                },
                                                skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                          });
                                    };

                                    if ( true === refresh_markup ) {
                                          _sendRequestForAjaxMarkupRefresh();
                                    }

                                    // @todo:
                                    // for multi-item modules, send the item identifier
                                    if ( refreshMarkupWhenNeededForInput() ) {
                                          var _html_content = params.settingParams.args.input_value;
                                          if ( ! _.isString( _html_content ) ) {
                                                throw new Error( '::updateAPISettingAndExecutePreviewActions => _doUpdateWithRequestedAction => refreshMarkupWhenNeededForInput => html content is not a string.');
                                          }
                                          if ( ! self.htmlIncludesShortcodesOrTmplTags( _html_content ) ) {
                                                api.previewer.send( 'sek-update-html-in-selector', {
                                                      selector : inputRegistrationParams.refresh_markup,
                                                      html : _html_content,
                                                      id : params.uiParams.id,
                                                      location_skope_id : true === promiseParams.is_global_location ? sektionsLocalizedData.globalSkopeId : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                                      local_skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                                      apiParams : {
                                                            action : 'sek-update-html-in-selector',
                                                            id : params.uiParams.id,
                                                            level : params.uiParams.level
                                                      },
                                                      skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),//<= send skope id to the preview so we can use it when ajaxing
                                                });
                                          } else {
                                                _sendRequestForAjaxMarkupRefresh();
                                          }
                                    }

                                    // REFRESH THE PREVIEW ?
                                    if ( true === refresh_preview ) {
                                          api.previewer.refresh();
                                    }
                              })
                              .fail( function( er ) {
                                    api.errare( '::updateAPISettingAndExecutePreviewActions=> api setting not updated', er );
                                    api.errare( '::updateAPISettingAndExecutePreviewActions=> api setting not updated => params ', params );
                              });//self.updateAPISetting()
                        }
                  };//_doUpdateWithRequestedAction

                  // if the changed input is a google font modifier ( <=> true === refresh_fonts )
                  // => we want to first refresh the google font collection, and then proceed the requested action
                  // this way we make sure that the customized value used when ajaxing will take into account when writing the google font http request link
                  if ( true === refresh_fonts ) {
                        var newFontFamily = params.settingParams.args.input_value;
                        if ( ! _.isString( newFontFamily ) ) {
                              api.errare( 'updateAPISettingAndExecutePreviewActions => font-family must be a string', newFontFamily );
                              return;
                        }

                        // add it only if gfont
                        if ( newFontFamily.indexOf('gfont') > -1 ) {
                              if ( true === params.isGlobalOptions ) {
                                    _doUpdateWithRequestedAction( newFontFamily );
                              } else {
                                    self.updateAPISetting({
                                          action : 'sek-update-fonts',
                                          font_family : newFontFamily,
                                          is_global_location : self.isGlobalLocation( params.uiParams )
                                    })
                                    // we use always() instead of done here, because the api section setting might not be changed ( and therefore return a reject() promise ).
                                    // => this can occur when a user is setting a google font already picked elsewhere
                                    // @see case 'sek-update-fonts'
                                    .always( function() {
                                          _doUpdateWithRequestedAction().then( function() {
                                                // always refresh again after
                                                // Why ?
                                                // Because the first refresh was done before actually setting the new font family, so based on a previous set of fonts
                                                // which leads to have potentially an additional google fonts that we don't need after the first refresh
                                                // that's why this second refresh is required. It wont trigger any preview ajax actions. Simply refresh the root fonts property of the main api setting.
                                                self.updateAPISetting({
                                                      action : 'sek-update-fonts',
                                                      is_global_location : self.isGlobalLocation( params.uiParams )
                                                });
                                          });
                                    });
                              }
                        } else {
                             _doUpdateWithRequestedAction();
                        }
                  } else {
                        _doUpdateWithRequestedAction();
                  }
            },//updateAPISettingAndExecutePreviewActions



            // IMPORTANT => Updates the setting for global options
            updateGlobalGFonts : function( newFontFamily ) {
                  var self = this;
                  //api( sektionsLocalizedData.optNameForGlobalOptions )() is registered on ::initialize();
                  var rawGlobalOptions = api( sektionsLocalizedData.optNameForGlobalOptions )(),
                      clonedGlobalOptions = $.extend( true, {}, _.isObject( rawGlobalOptions ) ? rawGlobalOptions : {} );

                  // Get the gfonts from the level options and modules values
                  var currentGfonts = self.sniffGlobalGFonts( clonedGlobalOptions );
                  if ( ! _.contains( currentGfonts, newFontFamily ) ) {
                        if ( newFontFamily.indexOf('gfont') < 0 ) {
                              api.errare( 'updateAPISetting => ' + params.action + ' => error => must be a google font, prefixed gfont' );
                              __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => error => must be a google font, prefixed gfont');
                              return;
                        }
                        currentGfonts.push( newFontFamily );
                  }
                  // update the global gfonts collection
                  // this is then used server side in Sek_Dyn_CSS_Handler::sek_get_gfont_print_candidates to build the Google Fonts request
                  clonedGlobalOptions.fonts = currentGfonts;

                  // Set it
                  api( sektionsLocalizedData.optNameForGlobalOptions )( clonedGlobalOptions );
            },


            // Walk the global option and populate an array of google fonts
            // To be a candidate for sniffing, an input font value font should start with [gfont]
            // @return array
            sniffGlobalGFonts : function( _data_ ) {
                  var self = this,
                  gfonts = [],
                  _snifff_ = function( _data_ ) {
                        _.each( _data_, function( levelData, _key_ ) {
                              // of course, don't sniff the already stored fonts
                              if ( 'fonts' === _key_ )
                                return;
                              // example of input_id candidate 'font_family_css'
                              if ( _.isString( _key_ ) && _key_.indexOf('font_family') > -1 ) {
                                    if ( levelData.indexOf('gfont') > -1 && ! _.contains( gfonts, levelData ) ) {
                                          gfonts.push( levelData );
                                    }
                              }

                              if ( _.isArray( levelData ) || _.isObject( levelData ) ) {
                                    _snifff_( levelData );
                              }
                        });
                  };
                  if ( _.isArray( _data_ ) || _.isObject( _data_ ) ) {
                        _snifff_( _data_ );
                  }
                  return gfonts;
            },





            // @return a normalized and sanitized item value
            // What does this helper do ?
            // 1) remove title and id properties, we don't need them in db
            // 2) don't write if is equal to default
            normalizeAndSanitizeSingleItemInputValues : function( _item_, parentModuleType ) {
                  var itemNormalized = {},
                      itemNormalizedAndSanitized = {},
                      inputDefaultValue = null,
                      inputType = null,
                      sanitizedVal,
                      self = this,
                      isEqualToDefault = function( _val, _default ) {
                            var equal = false;
                            if ( _.isBoolean( _val ) || _.isBoolean( _default ) ) {
                                  equal = Boolean(_val) === Boolean(_default);
                            } else if ( _.isNumber( _val ) || _.isNumber( _default ) ) {
                                  equal = Number( _val ) === Number( _default );
                            } else if ( _.isString( _val ) || _.isString( _default ) ) {
                                  equal = _val+'' === _default+'';
                            } else if ( _.isObject( _val ) && _.isObject( _default ) ) {
                                  equal = _.isEqual( _val,_default );
                            } else if ( _.isArray( _val ) && _.isArray( _default ) ) {
                                  //@see https://stackoverflow.com/questions/39517316/check-for-equality-between-two-array
                                  equal = JSON.stringify(_val.sort()) === JSON.stringify(_default.sort());
                            } else {
                                  equal = _val === _default;
                            }
                            return equal;
                      };

                  // NORMALIZE
                  // title, id and module_type don't need to be saved in database
                  // title and id are legacy entries that can be used in multi-items modules to identify and name the item
                  // @see ::getDefaultItemModelFromRegisteredModuleData()
                  _.each( _item_, function( _val, input_id ) {
                        if ( _.contains( ['title', 'id' ], input_id ) )
                          return;

                        if ( null !== parentModuleType ) {
                              inputDefaultValue = self.getInputDefaultValue( input_id, parentModuleType );
                              if ( 'no_default_value_specified' === inputDefaultValue ) {
                                    api.infoLog( '::normalizeAndSanitizeSingleItemInputValues => missing default value for input ' + input_id + ' in module ' + parentModuleType );
                              }
                        }
                        if ( isEqualToDefault( _val, inputDefaultValue ) ) {
                              return;
                        // When the value is a string of an object, no need to write an empty value
                        } else if ( ( _.isString( _val ) || _.isObject( _val ) ) && _.isEmpty( _val ) ) {
                              return;
                        } else {
                              itemNormalized[ input_id ] = _val;
                        }
                  });


                  // SANITIZE
                  _.each( itemNormalized, function( _val, input_id ) {
                        // @see extend_api_base.js
                        // @see sektions::_7_0_sektions_add_inputs_to_api.js
                        switch( self.getInputType( input_id, parentModuleType ) ) {
                              case 'text' :
                              case 'textarea' :
                              case 'check' :
                              case 'gutencheck' :
                              case 'select' :
                              case 'radio' :
                              case 'number' :
                              case 'upload' :
                              case 'upload_url' :
                              case 'color' :
                              case 'wp_color_alpha' :
                              case 'wp_color' :
                              case 'content_picker' :
                              case 'detached_tinymce_editor' :
                              case 'nimble_tinymce_editor' :
                              case 'password' :
                              case 'range' :
                              case 'range_slider' :
                              case 'hidden' :
                              case 'h_alignment' :
                              case 'h_text_alignment' :

                              case 'spacing' :
                              case 'bg_position' :
                              case 'v_alignment' :
                              case 'font_size' :
                              case 'line_height' :
                              case 'font_picker' :
                                  sanitizedVal = _val;
                              break;
                              default :
                                  sanitizedVal = _val;
                              break;
                        }

                        itemNormalizedAndSanitized[ input_id ] = sanitizedVal;
                  });
                  return itemNormalizedAndSanitized;
            },











            // Is the UI currently displayed the one that is being requested ?
            // If so, don't generate the ui again
            // @return bool
            isUIControlAlreadyRegistered : function( uiElementId ) {
                  var self = this,
                      uiCandidate = _.filter( self.registered(), function( registered ) {
                            return registered.id == uiElementId && 'control' === registered.what;
                      }),
                      controlIsAlreadyRegistered = false;

                  // If the control is not been tracked in our self.registered(), let's check if it is registered in the api
                  // Typically, the module / section picker will match that case, because we don't keep track of it ( so it's not cleaned )
                  if ( _.isEmpty( uiCandidate ) ) {
                        controlIsAlreadyRegistered = api.control.has( uiElementId );
                  } else {
                        controlIsAlreadyRegistered = true;
                        // we should have only one uiCandidate with this very id
                        if ( uiCandidate.length > 1 ) {
                              api.errare( 'generateUI => why is this control registered more than once ? => ' + uiElementId );
                        }
                  }
                  return controlIsAlreadyRegistered;
            },



            /**
             * Gets a list of unique shortcodes or shortcode-look-alikes in the content.
             *
             * @param {string} content The content we want to scan for shortcodes.
             */
            htmlIncludesShortcodesOrTmplTags : function( content ) {
                  var shortcodes = content.match( /\[+([\w_-])+/g ),
                      tmpl_tags = content.match( /\{\{+([\w_-])+/g ),
                      shortcode_result = [],
                      tmpl_tag_result = [];

                  if ( shortcodes ) {
                    for ( var i = 0; i < shortcodes.length; i++ ) {
                      var _shortcode = shortcodes[ i ].replace( /^\[+/g, '' );

                      if ( shortcode_result.indexOf( _shortcode ) === -1 ) {
                        shortcode_result.push( _shortcode );
                      }
                    }
                  }
                  if ( tmpl_tags ) {
                    for ( var j = 0; j < tmpl_tags.length; j++ ) {
                      var _tag = tmpl_tags[ j ].replace( /^\[+/g, '' );

                      if ( tmpl_tag_result.indexOf( _tag ) === -1 ) {
                        tmpl_tag_result.push( _tag );
                      }
                    }
                  }
                  return !_.isEmpty( shortcode_result ) || !_.isEmpty( tmpl_tag_result );
            }
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // @params = {
            //    action : 'sek-generate-module-ui' / 'sek-generate-level-options-ui'
            //    level : params.level,
            //    id : params.id,
            //    in_sektion : params.in_sektion,
            //    in_column : params.in_column,
            //    options : params.options || []
            // }
            // @dfd = $.Deferred()
            // @return the state promise dfd
            generateUIforDraggableContent : function( params, dfd ) {
                  var self = this;
                  // Prepare the module map to register
                  var registrationParams = {};

                  $.extend( registrationParams, {
                        content_type_switcher : {
                              settingControlId : sektionsLocalizedData.optPrefixForSektionsNotSaved + '_sek_content_type_switcher_ui',
                              module_type : 'sek_content_type_switcher_module',
                              controlLabel :  sektionsLocalizedData.i18n['Select a content type'],
                              priority : 0,
                              settingValue : { content_type : params.content_type }
                              //icon : '<i class="material-icons sek-level-option-icon">center_focus_weak</i>'
                        },
                        module_picker : {
                              settingControlId : sektionsLocalizedData.optPrefixForSektionsNotSaved + '_sek_draggable_modules_ui',
                              module_type : 'sek_module_picker_module',
                              controlLabel : sektionsLocalizedData.i18n['Pick a module'],
                              content_type : 'module',
                              priority : 20,
                              icon : '<i class="fas fa-grip-vertical sek-level-option-icon"></i>'
                        },

                        sek_intro_sec_picker_module : {
                              settingControlId : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid() + '_sek_draggable_sections_ui',
                              module_type : 'sek_intro_sec_picker_module',
                              controlLabel :  sektionsLocalizedData.i18n['Sections for an introduction'],
                              content_type : 'section',
                              expandAndFocusOnInit : false,
                              priority : 10,
                              icon : '<i class="fas fa-grip-vertical sek-level-option-icon"></i>'
                        },
                        sek_features_sec_picker_module : {
                              settingControlId : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid() + '_sek_draggable_sections_ui',
                              module_type : 'sek_features_sec_picker_module',
                              controlLabel :  sektionsLocalizedData.i18n['Sections for services and features'],
                              content_type : 'section',
                              expandAndFocusOnInit : false,
                              priority : 10,
                              icon : '<i class="fas fa-grip-vertical sek-level-option-icon"></i>'
                        },
                        sek_about_sec_picker_module : {
                              settingControlId : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid() + '_sek_draggable_sections_ui',
                              module_type : 'sek_about_sec_picker_module',
                              controlLabel :  sektionsLocalizedData.i18n['About us sections'],
                              content_type : 'section',
                              expandAndFocusOnInit : false,
                              priority : 10,
                              icon : '<i class="fas fa-grip-vertical sek-level-option-icon"></i>'
                        },
                        sek_contact_sec_picker_module : {
                              settingControlId : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid() + '_sek_draggable_sections_ui',
                              module_type : 'sek_contact_sec_picker_module',
                              controlLabel :  sektionsLocalizedData.i18n['Contact-us sections'],
                              content_type : 'section',
                              expandAndFocusOnInit : false,
                              priority : 10,
                              icon : '<i class="fas fa-grip-vertical sek-level-option-icon"></i>'
                        },
                        sek_column_layouts_sec_picker_module : {
                              settingControlId : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid() + '_sek_draggable_sections_ui',
                              module_type : 'sek_column_layouts_sec_picker_module',
                              controlLabel :  sektionsLocalizedData.i18n['Empty sections with columns layout'],
                              content_type : 'section',
                              expandAndFocusOnInit : false,
                              priority : 10,
                              icon : '<i class="fas fa-grip-vertical sek-level-option-icon"></i>'
                        },

                        // Header/footer have been beta tested during 5 months and released in June 2019, in version 1.8.0
                        sek_header_sec_picker_module : {
                              settingControlId : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid() + '_sek_draggable_sections_ui',
                              module_type : 'sek_header_sec_picker_module',
                              controlLabel : sektionsLocalizedData.i18n['Header sections'],// sektionsLocalizedData.i18n['Header sections'],
                              content_type : 'section',
                              expandAndFocusOnInit : false,
                              priority : 10,
                              icon : '<i class="fas fa-grip-vertical sek-level-option-icon"></i>'
                        },
                        sek_footer_sec_picker_module : {
                              settingControlId : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid() + '_sek_draggable_sections_ui',
                              module_type : 'sek_footer_sec_picker_module',
                              controlLabel : sektionsLocalizedData.i18n['Footer sections'],// sektionsLocalizedData.i18n['Header sections'],
                              content_type : 'section',
                              expandAndFocusOnInit : false,
                              priority : 10,
                              icon : '<i class="fas fa-grip-vertical sek-level-option-icon"></i>'
                        }
                  });

                  // Beta features to merge here ?
                  // if ( sektionsLocalizedData.areBetaFeaturesEnabled ) {
                  //       $.extend( registrationParams, {});
                  // }

                  if ( sektionsLocalizedData.isSavedSectionEnabled ) {
                        $.extend( registrationParams, {
                              sek_my_sections_sec_picker_module : {
                                    settingControlId : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid() + '_sek_draggable_sections_ui',
                                    module_type : 'sek_my_sections_sec_picker_module',
                                    controlLabel :  '@missi18n My sections',
                                    content_type : 'section',
                                    expandAndFocusOnInit : false,
                                    priority : 10,
                                    icon : '<i class="fas fa-grip-vertical sek-level-option-icon"></i>'
                              }
                        });
                  }


                  // BAIL WITH A SEE-ME ANIMATION IF THIS UI IS CURRENTLY BEING DISPLAYED
                  // Is the UI currently displayed the one that is being requested ?
                  // If so :
                  // 1) visually remind the user that a module should be dragged
                  // 2) pass the content_type param to display the requested content_type
                  var firstKey = _.keys( registrationParams )[0],
                      firstControlId = registrationParams[firstKey].settingControlId;

                  if ( self.isUIControlAlreadyRegistered( firstControlId ) ) {
                        api.control( firstControlId, function( _control_ ) {
                              _control_.focus({
                                    completeCallback : function() {
                                          var $container = _control_.container;
                                          // @use button-see-mee css class declared in core in /wp-admin/css/customize-controls.css
                                          if ( $container.hasClass( 'button-see-me') )
                                            return;
                                          $container.addClass('button-see-me');
                                          _.delay( function() {
                                               $container.removeClass('button-see-me');
                                          }, 800 );
                                    }
                              });
                        });

                        return dfd;
                  }//if


                  // @return void()
                  _do_register_ = function() {
                        _.each( registrationParams, function( optionData, optionType ){
                              if ( ! api.has( optionData.settingControlId ) ) {
                                    // synchronize the module setting with the main collection setting
                                    api( optionData.settingControlId, function( _setting_ ) {
                                          _setting_.bind( function( to, from ) {
                                                api.errare('generateUIforDraggableContent => the setting() should not changed');
                                          });
                                    });
                                    api.CZR_Helpers.register( {
                                          origin : 'nimble',
                                          level : params.level,
                                          what : 'setting',
                                          id : optionData.settingControlId,
                                          dirty : false,
                                          value : optionData.settingValue || {},
                                          transport : 'postMessage',// 'refresh',
                                          type : '_nimble_ui_'//will be dynamically registered but not saved in db as option// columnData.settingType
                                    });
                              }

                              api.CZR_Helpers.register( {
                                    origin : 'nimble',
                                    level : params.level,
                                    what : 'control',
                                    id : optionData.settingControlId,
                                    label : optionData.controlLabel,
                                    type : 'czr_module',//sekData.controlType,
                                    module_type : optionData.module_type,
                                    section : self.SECTION_ID_FOR_CONTENT_PICKER,
                                    priority : optionData.priority || 10,
                                    settings : { default : optionData.settingControlId },
                                    track : false//don't register in the self.registered() => this will prevent this container to be removed when cleaning the registered
                              }).done( function() {
                                    api.control( optionData.settingControlId, function( _control_ ) {
                                          // set the control type property
                                          _control_.content_type = optionData.content_type;//<= used to handle visibility when switching content type with the "content_type_switcher" control

                                          // we set the focus to false when firing api.previewer.trigger( 'sek-pick-content', { focus : false }); in ::initialize()
                                          if ( true === params.focus ) {
                                                _control_.focus({
                                                      completeCallback : function() {}
                                                });
                                          }

                                          var $title = _control_.container.find('label > .customize-control-title'),
                                              _titleContent = $title.html();
                                          // We wrap the original text content in this span.sek-ctrl-accordion-title in order to style it (underlined) independently ( without styling the icons next to it )
                                          $title.html( ['<span class="sek-ctrl-accordion-title">', _titleContent, '</span>' ].join('') );

                                          // if this level has an icon, let's prepend it to the title
                                          if ( ! _.isUndefined( optionData.icon ) ) {
                                                $title.addClass('sek-flex-vertical-center').prepend( optionData.icon );
                                          }

                                          // ACCORDION
                                          // Setup the accordion only for section content type
                                          if ( 'section' === _control_.content_type ) {
                                                // Hide the item wrapper
                                                _control_.container.find('.czr-items-wrapper').hide();
                                                // prepend the animated arrow
                                                $title.prepend('<span class="sek-animated-arrow" data-name="icon-chevron-down"><span class="fa fa-chevron-down"></span></span>');
                                                // setup the initial state + initial click
                                                _control_.container.attr('data-sek-expanded', "false" );
                                                if ( true === optionData.expandAndFocusOnInit && "false" == _control_.container.attr('data-sek-expanded' ) ) {
                                                      _control_.container.find('.czr-items-wrapper').show();
                                                      $title.trigger('click');
                                                }
                                          } else {
                                                _control_.container.attr('data-sek-accordion', 'no');
                                          }

                                    });
                              });
                        });//_.each
                  };//_do_register_


                  // the self.SECTION_ID_FOR_CONTENT_PICKER section is registered on initialize
                  // @fixes https://github.com/presscustomizr/nimble-builder/issues/187
                  api.section( self.SECTION_ID_FOR_CONTENT_PICKER, function( _section_ ) {
                        _do_register_();

                        // Style the section title
                        var $sectionTitleEl = _section_.container.find('.accordion-section-title'),
                            $panelTitleEl = _section_.container.find('.customize-section-title h3');

                        // The default title looks like this : Title <span class="screen-reader-text">Press return or enter to open this section</span>
                        if ( 0 < $sectionTitleEl.length && $sectionTitleEl.find('.sek-level-option-icon').length < 1 ) {
                              $sectionTitleEl.prepend( '<i class="fas fa-grip-vertical sek-level-option-icon"></i>' );
                        }

                        // The default title looks like this : <span class="customize-action">Customizing</span> Title
                        if ( 0 < $panelTitleEl.length && $panelTitleEl.find('.sek-level-option-icon').length < 1 ) {
                              $panelTitleEl.find('.customize-action').after( '<i class="fas fa-grip-vertical sek-level-option-icon"></i>' );
                        }

                        // Schedule the accordion behaviour
                        self.scheduleModuleAccordion.call( _section_, { expand_first_control : true } );

                        // Fetch the presetSectionCollection from the server now, so we save a few milliseconds when injecting the first preset_section
                        // it populates api.sek_presetSections
                        //
                        // updated in v1.7.5, may 21st : performance improvements on customizer load
                        // inserting preset sections is not on all Nimble sessions => let's only fetch when user inserts the first section
                        // self._maybeFetchSectionsFromServer();
                  });
                  return dfd;
            }
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // @params = {
            //    action : 'sek-generate-module-ui' / 'sek-generate-level-options-ui'
            //    level : params.level,
            //    id : params.id,
            //    in_sektion : params.in_sektion,
            //    in_column : params.in_column,
            //    options : params.options || []
            // }
            // @dfd = $.Deferred()
            // @return the state promise dfd
            generateUIforFrontModules : function( params, dfd ) {
                  var self = this;
                  if ( _.isEmpty( params.id ) ) {
                        dfd.reject( 'generateUI => missing id' );
                  }

                  // For modules, we need to generate a UI for the module value
                  var moduleValue = self.getLevelProperty({
                        property : 'value',
                        id : params.id
                  });

                  var moduleType = self.getLevelProperty({
                        property : 'module_type',
                        id : params.id
                  });

                  var moduleName = self.getRegisteredModuleProperty( moduleType, 'name' );

                  if ( _.isEmpty( moduleType ) ) {
                        dfd.reject( 'generateUI => module => invalid module_type' );
                  }

                  // Prepare the module map to register
                  var modulesRegistrationParams = {};

                  if ( true === self.getRegisteredModuleProperty( moduleType, 'is_father' ) ) {
                        var _childModules_ = self.getRegisteredModuleProperty( moduleType, 'children' );
                        if ( _.isEmpty( _childModules_ ) ) {
                              throw new Error('::generateUIforFrontModules => a father module ' + moduleType + ' is missing children modules ');
                        } else {
                              _.each( _childModules_, function( mod_type, optionType ){
                                    modulesRegistrationParams[ optionType ] = {
                                          settingControlId : params.id + '__' + optionType,
                                          module_type : mod_type,
                                          controlLabel : self.getRegisteredModuleProperty( mod_type, 'name' )
                                          //icon : '<i class="material-icons sek-level-option-icon">code</i>'
                                    };
                              });
                        }
                  } else {
                        modulesRegistrationParams.__no_option_group_to_be_updated_by_children_modules__ = {
                              settingControlId : params.id,
                              module_type : moduleType,
                              controlLabel : moduleName
                              //icon : '<i class="material-icons sek-level-option-icon">code</i>'
                        };
                  }

                  // BAIL WITH A SEE-ME ANIMATION IF THIS UI IS CURRENTLY BEING DISPLAYED
                  // Is the UI currently displayed the one that is being requested ?
                  // Check if the first control of the list is already registered
                  // If so, visually remind the user and break;
                  var firstKey = _.keys( modulesRegistrationParams )[0],
                      firstControlId = modulesRegistrationParams[firstKey].settingControlId;

                  if ( self.isUIControlAlreadyRegistered( firstControlId ) ) {
                        api.control( firstControlId ).focus({
                              completeCallback : function() {
                                    var $container = api.control( firstControlId ).container;
                                    // @use button-see-mee css class declared in core in /wp-admin/css/customize-controls.css
                                    if ( $container.hasClass( 'button-see-me') )
                                      return;
                                    $container.addClass('button-see-me');
                                    _.delay( function() {
                                         $container.removeClass('button-see-me');
                                    }, 800 );
                              }
                        });
                        return dfd;
                  }//if

                  // Clean previously generated UI elements
                  self.cleanRegistered();

                  _do_register_ = function() {
                        _.each( modulesRegistrationParams, function( optionData, optionType ){
                              // Make sure this setting is bound only once !
                              if ( ! api.has( optionData.settingControlId ) ) {
                                    var doUpdate = function( to, from, args ) {
                                          try { self.updateAPISettingAndExecutePreviewActions({
                                                defaultPreviewAction : 'refresh_markup',
                                                uiParams : _.extend( params, { action : 'sek-set-module-value' } ),
                                                options_type : optionType,
                                                settingParams : {
                                                      to : to,
                                                      from : from,
                                                      args : args
                                                }
                                          }); } catch( er ) {
                                                api.errare( '::generateUIforFrontModules => Error in updateAPISettingAndExecutePreviewActions', er );
                                          }
                                    };

                                    // Schedule the binding to synchronize the module setting with the main collection setting
                                    // Note 1 : unlike control or sections, the setting are not getting cleaned up on each ui generation.
                                    // They need to be kept in order to keep track of the changes in the customizer.
                                    // => that's why we check if ! api.has( ... )
                                    api( optionData.settingControlId, function( _setting_ ) {
                                          _setting_.bind( _.debounce( doUpdate, self.SETTING_UPDATE_BUFFER ) );//_setting_.bind( _.debounce( function( to, from, args ) {}
                                    });

                                    var settingValueOnRegistration = $.extend( true, {}, moduleValue );
                                    if ( '__no_option_group_to_be_updated_by_children_modules__' !== optionType ) {
                                          settingValueOnRegistration = ( !_.isEmpty( settingValueOnRegistration ) && _.isObject( settingValueOnRegistration ) && _.isObject( settingValueOnRegistration[optionType] ) ) ? settingValueOnRegistration[optionType] : {};
                                    }
                                    api.CZR_Helpers.register({
                                          origin : 'nimble',
                                          level : params.level,
                                          what : 'setting',
                                          id : optionData.settingControlId,
                                          dirty : false,
                                          value : settingValueOnRegistration,
                                          transport : 'postMessage',// 'refresh',
                                          type : '_nimble_ui_'//will be dynamically registered but not saved in db as option// columnData.settingType
                                    });
                              }//if ( ! api.has( optionData.settingControlId ) )


                              api.CZR_Helpers.register( {
                                    origin : 'nimble',
                                    level : params.level,
                                    what : 'control',
                                    id : optionData.settingControlId,
                                    label : optionData.controlLabel,
                                    //label : sektionsLocalizedData.i18n['Customize the options for module :'] + ' ' + optionData.controlLabel,
                                    type : 'czr_module',//sekData.controlType,
                                    module_type : optionData.module_type,
                                    section : params.id,
                                    priority : 10,
                                    settings : { default : optionData.settingControlId }
                              }).done( function() {});

                              // Implement the animated arrow markup, and the initial state of the module visibility
                              api.control( optionData.settingControlId, function( _control_ ) {
                                    api.control( optionData.settingControlId ).focus({
                                          completeCallback : function() {}
                                    });
                                    // Hide the item wrapper
                                    _control_.container.find('.czr-items-wrapper').hide();
                                    var $title = _control_.container.find('label > .customize-control-title'),
                                        _titleContent = $title.html();

                                    $title.html( ['<span class="sek-ctrl-accordion-title">', _titleContent, '</span>' ].join('') );
                                    // if this level has an icon, let's prepend it to the title
                                    if ( ! _.isUndefined( optionData.icon ) ) {
                                          $title.addClass('sek-flex-vertical-center').prepend( optionData.icon );
                                    }
                                    // prepend the animated arrow
                                    $title.prepend('<span class="sek-animated-arrow" data-name="icon-chevron-down"><span class="fa fa-chevron-down"></span></span>');
                                    // setup the initial state + initial click
                                    _control_.container.attr('data-sek-expanded', "false" );
                              });
                        });//each()
                  };//_do_register()



                  // Defer the registration when the parent section gets added to the api
                  api.section.when( params.id, function() {
                        api.section(params.id).focus();
                        _do_register_();
                  });


                  // MAIN CONTENT SECTION
                  api.CZR_Helpers.register({
                        origin : 'nimble',
                        what : 'section',
                        id : params.id,
                        title: sektionsLocalizedData.i18n['Content for'] + ' ' + moduleName,
                        panel : sektionsLocalizedData.sektionsPanelId,
                        priority : 1000,
                        //track : false//don't register in the self.registered()
                        //constructWith : MainSectionConstructor,
                  }).done( function() {});

                  api.section( params.id, function( _section_ ) {
                        // don't display the clickable section title in the nimble root panel
                        _section_.container.find('.accordion-section-title').first().hide();

                        // Style the section title
                        var $panelTitleEl = _section_.container.find('.customize-section-title h3');

                        // The default title looks like this : <span class="customize-action">Customizing</span> Title
                        if ( 0 < $panelTitleEl.length ) {
                              $panelTitleEl.find('.customize-action').after( '<i class="fas fa-pencil-alt sek-level-option-icon"></i>' );
                        }

                        // Schedule the accordion behaviour
                        self.scheduleModuleAccordion.call( _section_, { expand_first_control : true } );
                  });
                  return dfd;
            }
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // @params = {
            //    action : 'sek-generate-module-ui' / 'sek-generate-level-options-ui'
            //    level : params.level,
            //    id : params.id,
            //    in_sektion : params.in_sektion,
            //    in_column : params.in_column,
            //    options : params.options || []
            // }
            // @dfd = $.Deferred()
            // @return the state promise dfd
            generateUIforLevelOptions : function( params, dfd ) {
                  var self = this;
                  // Get this level options
                  var levelOptionValues = self.getLevelProperty({
                            property : 'options',
                            id : params.id
                      });
                  levelOptionValues = _.isObject( levelOptionValues ) ? levelOptionValues : {};


                  // Prepare the module map to register
                  var modulesRegistrationParams = {};

                  $.extend( modulesRegistrationParams, {
                        bg : {
                              settingControlId : params.id + '__bg_options',
                              module_type : 'sek_level_bg_module',
                              controlLabel : sektionsLocalizedData.i18n['Background settings for the'] + ' ' + sektionsLocalizedData.i18n[params.level],
                              expandAndFocusOnInit : true,
                              icon : '<i class="material-icons sek-level-option-icon">gradient</i>'//'<i class="material-icons sek-level-option-icon">brush</i>'
                        },
                        border : {
                              settingControlId : params.id + '__border_options',
                              module_type : 'sek_level_border_module',
                              controlLabel : sektionsLocalizedData.i18n['Borders settings for the'] + ' ' + sektionsLocalizedData.i18n[params.level],
                              //expandAndFocusOnInit : true,
                              icon : '<i class="material-icons sek-level-option-icon">rounded_corner</i>'//'<i class="material-icons sek-level-option-icon">brush</i>'
                        },
                        spacing : {
                              settingControlId : params.id + '__spacing_options',
                              module_type : 'sek_level_spacing_module',
                              controlLabel : sektionsLocalizedData.i18n['Padding and margin settings for the'] + ' ' + sektionsLocalizedData.i18n[params.level],
                              icon : '<i class="material-icons sek-level-option-icon">center_focus_weak</i>'
                        },
                        anchor : {
                              settingControlId : params.id + '__anchor_options',
                              module_type : 'sek_level_anchor_module',
                              controlLabel : sektionsLocalizedData.i18n['Custom anchor ( CSS ID ) and CSS classes for the'] + ' ' + sektionsLocalizedData.i18n[params.level],
                              icon : '<i class="fas fa-anchor sek-level-option-icon"></i>'
                        },
                        visibility : {
                              settingControlId : params.id + '__visibility_options',
                              module_type : 'sek_level_visibility_module',
                              controlLabel : sektionsLocalizedData.i18n['Device visibility settings for the'] + ' ' + sektionsLocalizedData.i18n[params.level],
                              icon : '<i class="far fa-eye sek-level-option-icon"></i>'
                        },
                        height : {
                              settingControlId : params.id + '__height_options',
                              module_type : 'sek_level_height_module',
                              controlLabel : sektionsLocalizedData.i18n['Height and vertical alignment for the'] + ' ' + sektionsLocalizedData.i18n[params.level],
                              icon : '<i class="fas fa-ruler-vertical sek-level-option-icon"></i>'
                        },
                  });

                  if ( 'section' === params.level ) {
                        $.extend( modulesRegistrationParams, {
                              width : {
                                    settingControlId : params.id + '__width_options',
                                    module_type : 'sek_level_width_section',
                                    controlLabel : sektionsLocalizedData.i18n['Width settings for the'] + ' ' + sektionsLocalizedData.i18n[params.level],
                                    icon : '<i class="fas fa-ruler-horizontal sek-level-option-icon"></i>'
                              }
                        });
                        // Deactivated
                        // => replaced by sek_level_width_section
                        // $.extend( modulesRegistrationParams, {
                        //       layout : {
                        //             settingControlId : params.id + '__sectionLayout_options',
                        //             module_type : 'sek_level_section_layout_module',
                        //             controlLabel : sektionsLocalizedData.i18n['Layout settings for the'] + ' ' + sektionsLocalizedData.i18n[params.level],
                        //             icon : '<i class="material-icons sek-level-option-icon">crop_din</i>'
                        //       }
                        // });
                        $.extend( modulesRegistrationParams, {
                              breakpoint : {
                                    settingControlId : params.id + '__breakpoint_options',
                                    module_type : 'sek_level_breakpoint_module',
                                    controlLabel : sektionsLocalizedData.i18n['Responsive settings : breakpoint, column direction'],
                                    icon : '<i class="material-icons sek-level-option-icon">devices</i>'
                              }
                        });
                  }
                  if ( 'column' === params.level ) {
                        $.extend( modulesRegistrationParams, {
                              width : {
                                    settingControlId : params.id + '__width_options',
                                    module_type : 'sek_level_width_column',
                                    controlLabel : sektionsLocalizedData.i18n['Width settings for the'] + ' ' + sektionsLocalizedData.i18n[params.level],
                                    icon : '<i class="fas fa-ruler-horizontal sek-level-option-icon"></i>'
                              }
                        });
                  }
                  if ( 'module' === params.level ) {
                        $.extend( modulesRegistrationParams, {
                              width : {
                                    settingControlId : params.id + '__width_options',
                                    module_type : 'sek_level_width_module',
                                    controlLabel : sektionsLocalizedData.i18n['Width settings for the'] + ' ' + sektionsLocalizedData.i18n[params.level],
                                    icon : '<i class="fas fa-ruler-horizontal sek-level-option-icon"></i>'
                              }
                        });
                  }


                  // BAIL WITH A SEE-ME ANIMATION IF THIS UI IS CURRENTLY BEING DISPLAYED
                  // Is the UI currently displayed the one that is being requested ?
                  // Check if the first control of the list is already registered
                  // If so, visually remind the user and break;
                  var firstKey = _.keys( modulesRegistrationParams )[0],
                      firstControlId = modulesRegistrationParams[firstKey].settingControlId;

                  if ( self.isUIControlAlreadyRegistered( firstControlId ) ) {
                        api.control( firstControlId ).focus({
                              completeCallback : function() {
                                    var $container = api.control( firstControlId ).container;
                                    // @use button-see-mee css class declared in core in /wp-admin/css/customize-controls.css
                                    if ( $container.hasClass( 'button-see-me') )
                                      return;
                                    $container.addClass('button-see-me');
                                    _.delay( function() {
                                         $container.removeClass('button-see-me');
                                    }, 800 );
                              }
                        });
                        return dfd;
                  }//if

                  // Clean previously generated UI elements
                  self.cleanRegistered();


                  // @return void()
                  _do_register_ = function() {
                        _.each( modulesRegistrationParams, function( optionData, optionType ){
                               // Is the UI currently displayed the one that is being requested ?
                              // If so, don't generate the ui again, simply focus on the section
                              if ( self.isUIControlAlreadyRegistered( optionData.settingControlId ) ) {
                                    api.section( api.control( optionData.settingControlId ).section() ).expanded( true );
                                    return;
                              }
                              if( ! api.has( optionData.settingControlId ) ) {
                                    var doUpdate = function( to, from, args ) {
                                          try { self.updateAPISettingAndExecutePreviewActions({
                                                defaultPreviewAction : 'refresh_stylesheet',
                                                uiParams : params,
                                                options_type : optionType,// <= this is the options sub property where we will store this setting values. @see updateAPISetting case 'sek-generate-level-options-ui'
                                                settingParams : {
                                                      to : to,
                                                      from : from,
                                                      args : args
                                                }
                                          }); } catch( er ) {
                                                api.errare( '::generateUIforLevelOptions => Error in updateAPISettingAndExecutePreviewActions', er );
                                          }
                                    };

                                    // Schedule the binding to synchronize the options with the main collection setting
                                    // Note 1 : unlike control or sections, the setting are not getting cleaned up on each ui generation.
                                    // They need to be kept in order to keep track of the changes in the customizer.
                                    // => that's why we check if ! api.has( ... )
                                    api( optionData.settingControlId, function( _setting_ ) {
                                          _setting_.bind( _.debounce( doUpdate, self.SETTING_UPDATE_BUFFER ) );//_setting_.bind( _.debounce( function( to, from, args ) {}
                                    });//api( Id, function( _setting_ ) {})

                                    // Let's add the starting values if provided when registrating the module
                                    var initialModuleValues = levelOptionValues[ optionType ] || {};
                                    var startingModuleValue = self.getModuleStartingValue( optionData.module_type );
                                    if ( 'no_starting_value' !== startingModuleValue && _.isObject( startingModuleValue ) ) {
                                          // make sure the starting values are deeped clone now, before being extended
                                          var clonedStartingModuleValue = $.extend( true, {}, startingModuleValue );
                                          initialModuleValues = $.extend( clonedStartingModuleValue, initialModuleValues );
                                    }

                                    api.CZR_Helpers.register( {
                                          origin : 'nimble',
                                          level : params.level,
                                          what : 'setting',
                                          id : optionData.settingControlId,
                                          dirty : false,
                                          value : initialModuleValues,
                                          transport : 'postMessage',// 'refresh',
                                          type : '_nimble_ui_'//will be dynamically registered but not saved in db as option //sekData.settingType
                                    });
                              }//if( ! api.has( optionData.settingControlId ) ) {

                              api.CZR_Helpers.register( {
                                    origin : 'nimble',
                                    level : params.level,
                                    level_id : params.id,
                                    what : 'control',
                                    id : optionData.settingControlId,
                                    label : optionData.controlLabel,
                                    type : 'czr_module',//sekData.controlType,
                                    module_type : optionData.module_type,
                                    section : params.id,
                                    priority : 0,
                                    settings : { default : optionData.settingControlId }
                              }).done( function() {});

                              // Implement the animated arrow markup, and the initial state of the module visibility
                              api.control( optionData.settingControlId, function( _control_ ) {
                                    if ( true === optionData.expandAndFocusOnInit ) {
                                          _control_.focus({
                                                completeCallback : function() {}
                                          });
                                    }

                                    // Hide the item wrapper
                                    _control_.container.find('.czr-items-wrapper').hide();
                                    var $title = _control_.container.find('label > .customize-control-title'),
                                        _titleContent = $title.html();
                                    // We wrap the original text content in this span.sek-ctrl-accordion-title in order to style it (underlined) independently ( without styling the icons next to it )
                                    $title.html( ['<span class="sek-ctrl-accordion-title">', _titleContent, '</span>' ].join('') );
                                    // if this level has an icon, let's prepend it to the title
                                    if ( ! _.isUndefined( optionData.icon ) ) {
                                          $title.addClass('sek-flex-vertical-center').prepend( optionData.icon );
                                    }
                                    // prepend the animated arrow
                                    $title.prepend('<span class="sek-animated-arrow" data-name="icon-chevron-down"><span class="fa fa-chevron-down"></span></span>');
                                    // setup the initial state + initial click
                                    _control_.container.attr('data-sek-expanded', "false" );
                                    // if ( true === optionData.expandAndFocusOnInit && "false" == _control_.container.attr('data-sek-expanded' ) ) {
                                    //       $title.trigger('click');
                                    // }
                              });
                        });//_.each()
                  };//_do_register_()

                  // The section won't be tracked <= not removed on each ui update
                  // Note : the check on api.section.has( params.id ) is also performd on api.CZR_Helpers.register(), but here we use it to avoid setting up the click listeners more than once.
                  if ( ! api.section.has( params.id ) ) {
                        api.section( params.id, function( _section_ ) {
                              // Schedule the accordion behaviour
                              self.scheduleModuleAccordion.call( _section_, { expand_first_control : true } );
                        });
                  }

                  api.CZR_Helpers.register({
                        origin : 'nimble',
                        what : 'section',
                        id : params.id,
                        title: sektionsLocalizedData.i18n['Settings for the'] + ' ' + params.level,
                        panel : sektionsLocalizedData.sektionsPanelId,
                        priority : 10,
                        //track : false//don't register in the self.registered()
                        //constructWith : MainSectionConstructor,
                  }).done( function() {});

                  // - Defer the registration when the parent section gets added to the api
                  // - Implement the module visibility
                  api.section( params.id, function( _section_ ) {
                        _do_register_();
                        // don't display the clickable section title in the nimble root panel
                        _section_.container.find('.accordion-section-title').first().hide();

                        // Style the section title
                        var $panelTitleEl = _section_.container.find('.customize-section-title h3');

                        // The default title looks like this : <span class="customize-action">Customizing</span> Title
                        if ( 0 < $panelTitleEl.length && $panelTitleEl.find('.sek-level-option-icon').length < 1 ) {
                              $panelTitleEl.find('.customize-action').after( '<i class="fas fa-sliders-h sek-level-option-icon"></i>' );
                        }
                  });

                  return dfd;
            }
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            getLocalSkopeOptionId : function() {
                  var skope_id = api.czr_skopeBase.getSkopeProperty( 'skope_id' );
                  if ( _.isEmpty( skope_id ) ) {
                        api.errare( 'czr_sektions::getLocalSkopeOptionId => empty skope_id ');
                        return '';
                  }
                  return sektionsLocalizedData.optPrefixForSektionsNotSaved + skope_id + '__localSkopeOptions';
            },
            // @params = {
            //    action : 'sek-generate-module-ui' / 'sek-generate-level-options-ui'
            //    level : params.level,
            //    id : params.id,
            //    in_sektion : params.in_sektion,
            //    in_column : params.in_column,
            //    options : params.options || []
            // }
            // @dfd = $.Deferred()
            // @return the state promise dfd
            generateUIforLocalSkopeOptions : function( params, dfd ) {
                  var self = this,
                      _id_ = self.getLocalSkopeOptionId();
                  // Is the UI currently displayed the one that is being requested ?
                  // If so, visually remind the user that a module should be dragged
                  if ( self.isUIControlAlreadyRegistered( _id_ ) ) {
                        return dfd;
                  }

                  // Prepare the module map to register
                  self.localOptionsRegistrationParams = {};
                  if ( _.isUndefined( sektionsLocalizedData.localOptionsMap ) || ! _.isObject( sektionsLocalizedData.localOptionsMap ) ) {
                        api.errare( '::generateUIforGlobalOptions => missing or invalid localOptionsMap');
                        return dfd;
                  }

                  // remove settings when requested
                  // Happens when importing a file
                  if ( true === params.clean_settings ) {
                        self.cleanRegisteredLocalOptionSettings();
                  }


                  // Populate the registration params
                  _.each( sektionsLocalizedData.localOptionsMap, function( mod_type, opt_name ) {
                        switch( opt_name ) {
                              case 'template' :
                                    self.localOptionsRegistrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__template',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Page template'],
                                          expandAndFocusOnInit : false,
                                          icon : '<i class="material-icons sek-level-option-icon">check_box_outline_blank</i>'
                                    };
                              break;
                              // Header and footer have been beta tested during 5 months and released in June 2019, in version 1.8.0
                              case 'local_header_footer':
                                    self.localOptionsRegistrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__local_header_footer',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Page header and footer'],
                                          icon : '<i class="material-icons sek-level-option-icon">web</i>'
                                    };
                              break;
                              case 'widths' :
                                    self.localOptionsRegistrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__widths',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Inner and outer widths'],
                                          icon : '<i class="fas fa-ruler-horizontal sek-level-option-icon"></i>'
                                    };
                              break;
                              case 'custom_css' :
                                    self.localOptionsRegistrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__custom_css',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Custom CSS'],
                                          icon : '<i class="material-icons sek-level-option-icon">code</i>'
                                    };
                              break;
                              case 'local_performances' :
                                    self.localOptionsRegistrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__local_performances',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Page speed optimizations'],
                                          icon : '<i class="fas fa-fighter-jet sek-level-option-icon"></i>'
                                    };
                              break;
                              case 'local_reset' :
                                    self.localOptionsRegistrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__local_reset',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Reset the sections in this page'],
                                          icon : '<i class="material-icons sek-level-option-icon">cached</i>'
                                    };
                              break;
                              case 'local_revisions' :
                                    self.localOptionsRegistrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__local_revisions',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Revision history of local sections'],
                                          icon : '<i class="material-icons sek-level-option-icon">history</i>'
                                    };
                              break;
                              case 'import_export' :
                                    self.localOptionsRegistrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__local_imp_exp',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Export / Import'],
                                          icon : '<i class="material-icons sek-level-option-icon">import_export</i>'
                                    };
                              break;
                              default :
                                    api.errare('::generateUIforLocalOptions => an option group could not be registered => ' + mod_type, opt_name );
                              break;
                        }//switch
                  });//_.each

                  // Get the current local options from the local setting value
                  // local setting value is structured this way :
                  // {
                  //    collection : [],
                  //    local_options : {},
                  //    fonts : []
                  // }
                  // we only need the local_options here
                  var currentSetValue = api( self.localSectionsSettingId() )(),
                      currentAllLocalOptionsValue = $.extend( true, {}, _.isObject( currentSetValue.local_options ) ? currentSetValue.local_options : {} );

                  _do_register_ = function() {
                        _.each( self.localOptionsRegistrationParams, function( optionData, optionType ){
                              // Let's add the starting values if provided when registrating the module
                              var startingModuleValue = self.getModuleStartingValue( optionData.module_type ),
                                  optionTypeValue = _.isObject( currentAllLocalOptionsValue[ optionType ] ) ? currentAllLocalOptionsValue[ optionType ]: {},
                                  initialModuleValues = optionTypeValue;

                              if ( ! api.has( optionData.settingControlId ) ) {
                                    var doUpdate = function( to, from, args ) {
                                          try { self.updateAPISettingAndExecutePreviewActions({
                                                defaultPreviewAction : 'refresh_preview',
                                                uiParams : params,
                                                options_type : optionType,
                                                settingParams : {
                                                      to : to,
                                                      from : from,
                                                      args : args
                                                }
                                          }); } catch( er ) {
                                                api.errare( '::generateUIforLocalSkopeOptions => Error in updateAPISettingAndExecutePreviewActions', er );
                                          }
                                    };

                                    // Schedule the binding to synchronize the options with the main collection setting
                                    // Note 1 : unlike control or sections, the setting are not getting cleaned up on each ui generation.
                                    // They need to be kept in order to keep track of the changes in the customizer.
                                    // => that's why we check if ! api.has( ... )
                                    api( optionData.settingControlId, function( _setting_ ) {
                                          _setting_.bind( _.debounce( doUpdate, self.SETTING_UPDATE_BUFFER ) );//_setting_.bind( _.debounce( function( to, from, args ) {}
                                    });//api( Id, function( _setting_ ) {})



                                    if ( 'no_starting_value' !== startingModuleValue && _.isObject( startingModuleValue ) ) {
                                          // make sure the starting values are deeped clone now, before being extended
                                          var clonedStartingModuleValue = $.extend( true, {}, startingModuleValue );
                                          initialModuleValues = $.extend( clonedStartingModuleValue, initialModuleValues );
                                    }

                                    api.CZR_Helpers.register( {
                                          origin : 'nimble',
                                          level : params.level,
                                          what : 'setting',
                                          id : optionData.settingControlId,
                                          dirty : false,
                                          value : initialModuleValues,
                                          transport : 'postMessage',//'refresh',//// ,
                                          type : '_nimble_ui_'//will be dynamically registered but not saved in db as option// columnData.settingType
                                    });
                              }//if ( ! api.has( optionData.settingControlId ) )

                              api.CZR_Helpers.register({
                                    origin : 'nimble',
                                    level : params.level,
                                    what : 'control',
                                    id : optionData.settingControlId,
                                    label : optionData.controlLabel,
                                    type : 'czr_module',//sekData.controlType,
                                    module_type : optionData.module_type,
                                    section : self.SECTION_ID_FOR_LOCAL_OPTIONS,
                                    priority : 10,
                                    settings : { default : optionData.settingControlId },
                                    //track : false//don't register in the self.registered() => this will prevent this container to be removed when cleaning the registered
                              }).done( function() {

                                    // if ( true === optionData.expandAndFocusOnInit ) {
                                    //       api.control( optionData.settingControlId ).focus({
                                    //             completeCallback : function() {}
                                    //       });
                                    // }

                                    // Implement the animated arrow markup, and the initial state of the module visibility
                                    api.control( optionData.settingControlId, function( _control_ ) {
                                          // Hide the item wrapper
                                          _control_.container.find('.czr-items-wrapper').hide();
                                          var $title = _control_.container.find('label > .customize-control-title'),
                                              _titleContent = $title.html();
                                          // We wrap the original text content in this span.sek-ctrl-accordion-title in order to style it (underlined) independently ( without styling the icons next to it )
                                          $title.html( ['<span class="sek-ctrl-accordion-title">', _titleContent, '</span>' ].join('') );

                                          // if this level has an icon, let's prepend it to the title
                                          if ( ! _.isUndefined( optionData.icon ) ) {
                                                $title.addClass('sek-flex-vertical-center').prepend( optionData.icon );
                                          }
                                          // prepend the animated arrow
                                          $title.prepend('<span class="sek-animated-arrow" data-name="icon-chevron-down"><span class="fa fa-chevron-down"></span></span>');
                                          // setup the initial state + initial click
                                          _control_.container.attr('data-sek-expanded', "false" );
                                          if ( true === optionData.expandAndFocusOnInit && "false" == _control_.container.attr('data-sek-expanded' ) ) {
                                                $title.trigger('click');
                                          }
                                    });
                              });
                        });//_.each()
                  };//_do_register()

                  // The parent section has already been added in ::initialize()
                  _do_register_();

                  return dfd;
            }
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // @params = {
            //    action : 'sek-generate-module-ui' / 'sek-generate-level-options-ui'
            //    level : params.level,
            //    id : params.id,
            //    in_sektion : params.in_sektion,
            //    in_column : params.in_column,
            //    options : params.options || []
            // }
            // @dfd = $.Deferred()
            // @return the state promise dfd
            generateUIforGlobalOptions : function( params, dfd ) {
                  var self = this,
                      _id_ = sektionsLocalizedData.optPrefixForSektionsNotSaved + sektionsLocalizedData.optNameForGlobalOptions;

                  // Is the UI currently displayed the one that is being requested ?
                  // If so, visually remind the user that a module should be dragged
                  if ( self.isUIControlAlreadyRegistered( _id_ ) ) {
                        return dfd;
                  }

                  // Prepare the module map to register
                  var registrationParams = {};
                  if ( _.isUndefined( sektionsLocalizedData.globalOptionsMap ) || ! _.isObject( sektionsLocalizedData.globalOptionsMap ) ) {
                        api.errare( '::generateUIforGlobalOptions => missing or invalid globalOptionsMap');
                        return dfd;
                  }

                  // Populate the registration params
                  _.each( sektionsLocalizedData.globalOptionsMap, function( mod_type, opt_name ) {
                        switch( opt_name ) {
                              // Header and footer have been beta tested during 5 months and released in June 2019, in version 1.8.0
                              case 'global_text' :
                                    registrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__global_text',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Global text options for Nimble sections'],
                                          icon : '<i class="material-icons sek-level-option-icon">text_format</i>'
                                    };
                              break;
                              case 'widths' :
                                    registrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__widths',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Site wide inner and outer sections widths'],
                                          icon : '<i class="fas fa-ruler-horizontal sek-level-option-icon"></i>'
                                    };
                              break;
                              case 'breakpoint' :
                                    registrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__breakpoint',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Site wide breakpoint for Nimble sections'],
                                          expandAndFocusOnInit : false,
                                          icon : '<i class="material-icons sek-level-option-icon">devices</i>'
                                    };
                              break;
                              case 'global_header_footer':
                                    registrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__header_footer',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Site wide header and footer'],
                                          icon : '<i class="material-icons sek-level-option-icon">web</i>'
                                    };
                              break;

                              case 'performances' :
                                    registrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__performances',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Site wide page speed optimizations'],
                                          icon : '<i class="fas fa-fighter-jet sek-level-option-icon"></i>'
                                    };
                              break;
                              case 'recaptcha' :
                                    registrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__recaptcha',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Protect your contact forms with Google reCAPTCHA'],
                                          icon : '<i class="material-icons sek-level-option-icon">security</i>'
                                    };
                              break;
                              case 'global_revisions' :
                                    registrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__global_revisions',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Revision history of global sections'],
                                          icon : '<i class="material-icons sek-level-option-icon">history</i>'
                                    };
                              break;
                              case 'global_reset' :
                                    registrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__global_reset',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Reset the sections displayed in global locations'],
                                          icon : '<i class="material-icons sek-level-option-icon">cached</i>'
                                    };
                              break;
                              case 'beta_features' :
                                    registrationParams[ opt_name ] = {
                                          settingControlId : _id_ + '__beta_features',
                                          module_type : mod_type,
                                          controlLabel : sektionsLocalizedData.i18n['Beta features'],
                                          icon : '<i class="material-icons sek-level-option-icon">widgets</i>'
                                    };
                              break;
                              default :
                                    api.errare('::generateUIforGlobalOptions => an option group could not be registered => ' + mod_type, opt_name );
                              break;
                        }//switch
                  });//_.each

                  // Let assign the global options to a var
                  var globalOptionDBValues = sektionsLocalizedData.globalOptionDBValues;

                  _do_register_ = function() {
                        _.each( registrationParams, function( optionData, optionType ){
                              if ( ! api.has( optionData.settingControlId ) ) {
                                    var doUpdate = function( to, from, args ) {
                                          try { self.updateAPISettingAndExecutePreviewActions({
                                                isGlobalOptions : true,//<= indicates that we won't update the local skope setting id
                                                defaultPreviewAction : 'refresh_preview',
                                                uiParams : params,
                                                options_type : optionType,
                                                settingParams : {
                                                      to : to,
                                                      from : from,
                                                      args : args
                                                }
                                          }); } catch( er ) {
                                                api.errare( '::generateUIforGlobalOptions => Error in updateAPISettingAndExecutePreviewActions', er );
                                          }
                                    };

                                    // Schedule the binding to synchronize the options with the main collection setting
                                    // Note 1 : unlike control or sections, the setting are not getting cleaned up on each ui generation.
                                    // They need to be kept in order to keep track of the changes in the customizer.
                                    // => that's why we check if ! api.has( ... )
                                    api( optionData.settingControlId, function( _setting_ ) {
                                          _setting_.bind( _.debounce( doUpdate, self.SETTING_UPDATE_BUFFER ) );//_setting_.bind( _.debounce( function( to, from, args ) {}
                                    });//api( Id, function( _setting_ ) {})

                                    // Let's add the starting values if provided when registrating the module
                                    var startingModuleValue = self.getModuleStartingValue( optionData.module_type ),
                                        initialModuleValues = ( _.isObject( globalOptionDBValues ) && ! _.isEmpty( globalOptionDBValues[ optionType ] ) ) ? globalOptionDBValues[ optionType ] : {};

                                    if ( 'no_starting_value' !== startingModuleValue && _.isObject( startingModuleValue ) ) {
                                          // make sure the starting values are deeped clone now, before being extended
                                          var clonedStartingModuleValue = $.extend( true, {}, startingModuleValue );
                                          initialModuleValues = $.extend( clonedStartingModuleValue, initialModuleValues );
                                    }

                                    api.CZR_Helpers.register( {
                                          origin : 'nimble',
                                          level : params.level,
                                          what : 'setting',
                                          id : optionData.settingControlId,
                                          dirty : false,
                                          value : initialModuleValues,
                                          transport : 'postMessage',//'refresh',//// ,
                                          type : '_nimble_ui_'//will be dynamically registered but not saved in db as option// columnData.settingType
                                    });
                              }

                              api.CZR_Helpers.register( {
                                    origin : 'nimble',
                                    level : params.level,
                                    what : 'control',
                                    id : optionData.settingControlId,
                                    label : optionData.controlLabel,
                                    type : 'czr_module',//sekData.controlType,
                                    module_type : optionData.module_type,
                                    section : self.SECTION_ID_FOR_GLOBAL_OPTIONS,//registered in ::initialize()
                                    priority : 20,
                                    settings : { default : optionData.settingControlId },
                                    track : false//don't register in the self.registered() => this will prevent this container to be removed when cleaning the registered
                              }).done( function() {
                                    // if ( true === optionData.expandAndFocusOnInit ) {
                                    //       api.control( optionData.settingControlId ).focus({
                                    //             completeCallback : function() {}
                                    //       });
                                    // }

                                    // Implement the animated arrow markup, and the initial state of the module visibility
                                    api.control( optionData.settingControlId, function( _control_ ) {
                                          // Hide the item wrapper
                                          _control_.container.find('.czr-items-wrapper').hide();
                                          var $title = _control_.container.find('label > .customize-control-title'),
                                              _titleContent = $title.html();
                                          // We wrap the original text content in this span.sek-ctrl-accordion-title in order to style it (underlined) independently ( without styling the icons next to it )
                                          $title.html( ['<span class="sek-ctrl-accordion-title">', _titleContent, '</span>' ].join('') );

                                          // if this level has an icon, let's prepend it to the title
                                          if ( ! _.isUndefined( optionData.icon ) ) {
                                                $title.addClass('sek-flex-vertical-center').prepend( optionData.icon );
                                          }
                                          // prepend the animated arrow
                                          $title.prepend('<span class="sek-animated-arrow" data-name="icon-chevron-down"><span class="fa fa-chevron-down"></span></span>');
                                          // setup the initial state + initial click
                                          _control_.container.attr('data-sek-expanded', "false" );
                                          if ( true === optionData.expandAndFocusOnInit && "false" == _control_.container.attr('data-sek-expanded' ) ) {
                                                $title.trigger('click');
                                          }
                                    });
                              });
                        });//_.each();
                  };//do register

                  // The parent section has already been added in ::initialize()
                  _do_register_();

                  return dfd;
            }
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData, serverControlParams
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // user action => this utility must be used to set the main setting value
            // params = {
            //    action : 'sek-add-section', 'sek-add-column', 'sek-add-module',...
            //    in_sektion
            //    in_column
            // }
            updateAPISetting : function( params ) {
                  var self = this,
                      __updateAPISettingDeferred__ = $.Deferred();

                  // Are we in global location ?
                  // Add the global information to the params
                  // => is used to determine the skope id when resolving the promise in reactToPreviewMsg
                  params = params || {};
                  params.is_global_location = 'global' === params.scope || self.isGlobalLocation( params );

                  var _collectionSettingId_ = params.is_global_location ? self.getGlobalSectionsSettingId() : self.localSectionsSettingId();
                  var _do_update_setting_id = function() {
                        // api( _collectionSettingId_)() = {
                        //    collection : [
                        //       'loop_start' :  { level : location,  collection : [ 'sek124' : { collection : [], level : section, options : {} }], options : {}},
                        //       'loop_end' : { level : location, collection : [], options : {}}
                        //        ...
                        //    ],
                        //    options : {}
                        //
                        // }
                        var currentSetValue = api( _collectionSettingId_ )(),
                            newSetValue = _.isObject( currentSetValue ) ? $.extend( true, {}, currentSetValue ) : self.getDefaultSektionSettingValue( params.is_global_location ? 'global' : 'local' ),
                            locationCandidate,
                            sektionCandidate,
                            columnCandidate,
                            moduleCandidate,
                            // move variables
                            originalCollection,
                            reorderedCollection,
                            //duplication variable
                            cloneId, //will be passed in resolve()
                            startingModuleValue,// will be populated by the optional starting value specificied on module registration
                            __presetSectionInjected__ = '_not_injection_scenario_',//this property is turned into a $.Deferred() object in a scenario of section injection
                            parentSektionCandidate;

                        // make sure we have a collection array to populate
                        newSetValue.collection = _.isArray( newSetValue.collection ) ? newSetValue.collection : self.getDefaultSektionSettingValue( params.is_global_location ? 'global' : 'local' ).collection;

                        switch( params.action ) {
                              //-------------------------------------------------------------------------------------------------
                              //-- SEKTION
                              //-------------------------------------------------------------------------------------------------
                              case 'sek-add-section' :
                                    // an id must be provided
                                    if ( _.isEmpty( params.id ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing id' );
                                    }

                                    if ( _.isEmpty( params.location ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing location' );
                                    }
                                    // Is this a nested sektion ?
                                    if ( true === params.is_nested ) {
                                          columnCandidate = self.getLevelModel( params.in_column, newSetValue.collection );
                                          // can we add this nested sektion ?
                                          // if the parent sektion of the column has is_nested = true, then we can't
                                          parentSektionCandidate = self.getLevelModel( params.in_sektion, newSetValue.collection );
                                          if ( 'no_match' == parentSektionCandidate ) {
                                                __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no grand parent sektion found');
                                                break;
                                          }
                                          if ( true === parentSektionCandidate.is_nested ) {
                                                __updateAPISettingDeferred__.reject( sektionsLocalizedData.i18n[ "You've reached the maximum number of allowed nested sections." ]);
                                                break;
                                          }
                                          if ( 'no_match' == columnCandidate ) {
                                                api.errare( 'updateAPISetting => ' + params.action + ' => no parent column matched' );
                                                __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no parent column matched');
                                                break;
                                          }
                                          columnCandidate.collection =  _.isArray( columnCandidate.collection ) ? columnCandidate.collection : [];
                                          columnCandidate.collection.push({
                                                id : params.id,
                                                level : 'section',
                                                collection : [{
                                                      id : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid(),
                                                      level : 'column',
                                                      collection : [],
                                                      ver_ini : sektionsLocalizedData.nimbleVersion
                                                }],
                                                is_nested : true,
                                                ver_ini : sektionsLocalizedData.nimbleVersion
                                          });
                                    } else {
                                          locationCandidate = self.getLevelModel( params.location, newSetValue.collection );
                                          if ( 'no_match' == locationCandidate ) {
                                                api.errare( 'updateAPISetting => ' + params.action + ' => no location matched' );
                                                __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no location matched');
                                                break;
                                          }
                                          locationCandidate.collection = _.isArray( locationCandidate.collection ) ? locationCandidate.collection : [];
                                          _.each( locationCandidate.collection, function( secModel, index ) {
                                                if ( params.before_section === secModel.id ) {
                                                      position = index;
                                                }
                                                if ( params.after_section === secModel.id ) {
                                                      position = index + 1;
                                                }
                                          });

                                          // @see reactToCollectionSettingIdChange
                                          locationCandidate.collection = _.isArray( locationCandidate.collection ) ? locationCandidate.collection : [];
                                          // insert the section in the collection at the right place
                                          locationCandidate.collection.splice( position, 0, {
                                                id : params.id,
                                                level : 'section',
                                                collection : [{
                                                      id : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid(),
                                                      level : 'column',
                                                      collection : [],
                                                      ver_ini : sektionsLocalizedData.nimbleVersion
                                                }],
                                                ver_ini : sektionsLocalizedData.nimbleVersion
                                          });
                                    }
                              break;


                              case 'sek-duplicate-section' :
                                    //api.infoLog('PARAMS IN sek-duplicate-section', params );
                                    // an id must be provided
                                    if ( _.isEmpty( params.id ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing id' );
                                    }

                                    if ( _.isEmpty( params.location ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing location' );
                                    }
                                    var deepClonedSektion;
                                    try { deepClonedSektion = self.cloneLevel( params.id ); } catch( er ) {
                                          api.errare( 'updateAPISetting => ' + params.action, er );
                                          break;
                                    }

                                    var _position_ = self.getLevelPositionInCollection( params.id, newSetValue.collection );
                                    // Is this a nested sektion ?
                                    if ( true === params.is_nested ) {
                                          columnCandidate = self.getLevelModel( params.in_column, newSetValue.collection );
                                          if ( 'no_match' == columnCandidate ) {
                                                api.errare( 'updateAPISetting => ' + params.action + ' => no parent column matched' );
                                                __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no parent column matched');
                                                break;
                                          }

                                          columnCandidate.collection =  _.isArray( columnCandidate.collection ) ? columnCandidate.collection : [];
                                          columnCandidate.collection.splice( parseInt( _position_ + 1, 10 ), 0, deepClonedSektion );


                                    } else {
                                          locationCandidate = self.getLevelModel( params.location, newSetValue.collection );
                                          if ( 'no_match' == locationCandidate ) {
                                                api.errare( 'updateAPISetting => ' + params.action + ' => no location matched' );
                                                __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no location matched');
                                                break;
                                          }
                                          locationCandidate.collection = _.isArray( locationCandidate.collection ) ? locationCandidate.collection : [];
                                          // @see reactToCollectionSettingIdChange
                                          locationCandidate.collection.splice( parseInt( _position_ + 1, 10 ), 0, deepClonedSektion );

                                    }
                                    cloneId = deepClonedSektion.id;//will be passed in resolve()
                              break;

                              // in the case of a nested sektion, we have to remove it from a column
                              // otherwise from the root sektion collection
                              case 'sek-remove-section' :
                                    //api.infoLog('PARAMS IN sek-remove-sektion', params );
                                    if ( true === params.is_nested ) {
                                          columnCandidate = self.getLevelModel( params.in_column, newSetValue.collection );
                                          if ( 'no_match' != columnCandidate ) {
                                                columnCandidate.collection =  _.isArray( columnCandidate.collection ) ? columnCandidate.collection : [];
                                                columnCandidate.collection = _.filter( columnCandidate.collection, function( col ) {
                                                      return col.id != params.id;
                                                });
                                          } else {
                                                api.errare( 'updateAPISetting => ' + params.action + ' => no parent column matched' );
                                          }
                                    } else {
                                          locationCandidate = self.getLevelModel( params.location, newSetValue.collection );
                                          if ( 'no_match' == locationCandidate ) {
                                                api.errare( 'updateAPISetting => ' + params.action + ' => no location matched' );
                                                __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no location matched');
                                                break;
                                          }
                                          locationCandidate.collection = _.filter( locationCandidate.collection, function( sek ) {
                                                return sek.id != params.id;
                                          });
                                    }
                              break;

                              case 'sek-move-section' :
                                    //api.infoLog('PARAMS in sek-move-section', params );
                                    var toLocationCandidate = self.getLevelModel( params.to_location, newSetValue.collection ),
                                        movedSektionCandidate,
                                        copyOfMovedSektionCandidate;

                                    if ( _.isEmpty( toLocationCandidate ) || 'no_match' == toLocationCandidate ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing target location' );
                                    }

                                    // MOVED CROSS LOCATIONS
                                    // - make a copy of the moved sektion
                                    // - remove the moved sektion from the source location
                                    if ( params.from_location != params.to_location ) {
                                          // Remove the moved sektion from the source location
                                          var fromLocationCandidate = self.getLevelModel( params.from_location, newSetValue.collection );
                                          if ( _.isEmpty( fromLocationCandidate ) || 'no_match' == fromLocationCandidate ) {
                                                throw new Error( 'updateAPISetting => ' + params.action + ' => missing source location' );
                                          }

                                          fromLocationCandidate.collection =  _.isArray( fromLocationCandidate.collection ) ? fromLocationCandidate.collection : [];
                                          // Make a copy of the sektion candidate now, before removing it
                                          movedSektionCandidate = self.getLevelModel( params.id, fromLocationCandidate.collection );
                                          copyOfMovedSektionCandidate = $.extend( true, {}, movedSektionCandidate );
                                          // remove the sektion from its previous sektion
                                          fromLocationCandidate.collection = _.filter( fromLocationCandidate.collection, function( sektion ) {
                                                return sektion.id != params.id;
                                          });
                                    }

                                    // UPDATE THE TARGET LOCATION
                                    toLocationCandidate.collection = _.isArray( toLocationCandidate.collection ) ? toLocationCandidate.collection : [];
                                    originalCollection = $.extend( true, [], toLocationCandidate.collection );
                                    reorderedCollection = [];
                                    _.each( params.newOrder, function( _id_ ) {
                                          // in the case of a cross location movement, we need to add the moved sektion to the target location
                                          if ( params.from_location != params.to_location && _id_ == copyOfMovedSektionCandidate.id ) {
                                                reorderedCollection.push( copyOfMovedSektionCandidate );
                                          } else {
                                                sektionCandidate = self.getLevelModel( _id_, originalCollection );
                                                if ( _.isEmpty( sektionCandidate ) || 'no_match' == sektionCandidate ) {
                                                      throw new Error( 'updateAPISetting => ' + params.action + ' => missing section candidate' );
                                                }
                                                reorderedCollection.push( sektionCandidate );
                                          }
                                    });
                                    toLocationCandidate.collection = reorderedCollection;

                              break;


                              // Fired on click on up / down arrows in the section ui menu
                              // This handles the nested sections case
                              case 'sek-move-section-up-down' :
                                    //api.infoLog('PARAMS in sek-move-section-up', params );
                                    parentCandidate = self.getLevelModel( params.is_nested ? params.in_column : params.location , newSetValue.collection );
                                    if ( _.isEmpty( parentCandidate ) || 'no_match' == parentCandidate ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing target location' );
                                    }
                                    parentCandidate.collection = _.isArray( parentCandidate.collection ) ? parentCandidate.collection : [];
                                    originalCollection = $.extend( true, [], parentCandidate.collection );
                                    reorderedCollection = $.extend( true, [], parentCandidate.collection );

                                    var _indexInOriginal = _.findIndex( originalCollection, function( _sec_ ) {
                                          return _sec_.id === params.id;
                                    });
                                    // @see https://underscorejs.org/#findIndex
                                    if ( -1 === _indexInOriginal ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => invalid index' );
                                    }

                                    // Swap up <=> down
                                    var direction = params.direction || 'up';

                                    // prevent absurd movements of a section
                                    // this should not happen because up / down arrows are not displayed when section is positionned top / bottom
                                    // but safer to add it
                                    if ( 'up' !== direction && originalCollection.length === _indexInOriginal + 1 ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => bottom reached' );
                                    } else if ( 'up' === direction && 0 === _indexInOriginal ){
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => top reached' );
                                    }

                                    reorderedCollection[ _indexInOriginal ] = originalCollection[ 'up' === direction ? _indexInOriginal - 1 : _indexInOriginal + 1 ];
                                    reorderedCollection[ 'up' === direction ? _indexInOriginal - 1 : _indexInOriginal + 1 ] = originalCollection[ _indexInOriginal ];
                                    parentCandidate.collection = reorderedCollection;
                              break;








                              //-------------------------------------------------------------------------------------------------
                              //-- COLUMN
                              //-------------------------------------------------------------------------------------------------
                              case 'sek-add-column' :
                                    // an id must be provided
                                    if ( _.isEmpty( params.id ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing id' );
                                    }
                                    sektionCandidate = self.getLevelModel( params.in_sektion, newSetValue.collection );
                                    if ( 'no_match' == sektionCandidate ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no parent sektion matched' );
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no parent sektion matched');
                                          break;
                                    }

                                    sektionCandidate.collection =  _.isArray( sektionCandidate.collection ) ? sektionCandidate.collection : [];
                                    // can we add another column ?
                                    if ( ( self.MAX_NUMBER_OF_COLUMNS - 1 ) < _.size( sektionCandidate.collection ) ) {
                                          __updateAPISettingDeferred__.reject( sektionsLocalizedData.i18n["You've reached the maximum number of columns allowed in this section."]);
                                          break;
                                    }

                                    // RESET ALL COLUMNS WIDTH
                                    // _.each( sektionCandidate.collection, function( colModel ) {
                                    //       colModel.width = '';
                                    // });
                                    self.resetColumnsWidthInSection( sektionCandidate );

                                    sektionCandidate.collection.push({
                                          id :  params.id,
                                          level : 'column',
                                          collection : [],
                                          ver_ini : sektionsLocalizedData.nimbleVersion
                                    });
                              break;


                              case 'sek-remove-column' :
                                    sektionCandidate = self.getLevelModel( params.in_sektion, newSetValue.collection );
                                    if ( 'no_match' != sektionCandidate ) {
                                          // can we remove the column ?
                                          if ( 1 === _.size( sektionCandidate.collection ) ) {
                                                __updateAPISettingDeferred__.reject( sektionsLocalizedData.i18n["A section must have at least one column."]);
                                                break;
                                          }
                                          sektionCandidate.collection =  _.isArray( sektionCandidate.collection ) ? sektionCandidate.collection : [];
                                          sektionCandidate.collection = _.filter( sektionCandidate.collection, function( column ) {
                                                return column.id != params.id;
                                          });
                                          // RESET ALL COLUMNS WIDTH
                                          // _.each( sektionCandidate.collection, function( colModel ) {
                                          //       colModel.width = '';
                                          // });
                                          self.resetColumnsWidthInSection( sektionCandidate );
                                    } else {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no parent sektion matched' );
                                    }

                              break;

                              case 'sek-duplicate-column' :
                                    // an id must be provided
                                    if ( _.isEmpty( params.id ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing id' );
                                    }

                                    sektionCandidate = self.getLevelModel( params.in_sektion, newSetValue.collection );
                                    if ( 'no_match' == sektionCandidate ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no parent sektion matched' );
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no parent sektion matched');
                                          break;
                                    }

                                    sektionCandidate.collection =  _.isArray( sektionCandidate.collection ) ? sektionCandidate.collection : [];
                                    // can we add another column ?
                                    if ( ( self.MAX_NUMBER_OF_COLUMNS - 1 ) < _.size( sektionCandidate.collection ) ) {
                                          __updateAPISettingDeferred__.reject( sektionsLocalizedData.i18n["You've reached the maximum number of columns allowed in this section."]);
                                          break;
                                    }

                                    var deepClonedColumn;
                                    try { deepClonedColumn = self.cloneLevel( params.id ); } catch( er ) {
                                          api.errare( 'updateAPISetting => ' + params.action, er );
                                          break;
                                    }
                                    var _position = self.getLevelPositionInCollection( params.id, newSetValue.collection );
                                    cloneId = deepClonedColumn.id;//will be passed in resolve()
                                    sektionCandidate.collection.splice( parseInt( _position + 1, 10 ), 0, deepClonedColumn );
                                    // RESET ALL COLUMNS WIDTH
                                    // _.each( sektionCandidate.collection, function( colModel ) {
                                    //       colModel.width = '';
                                    // });
                                    self.resetColumnsWidthInSection( sektionCandidate );
                              break;


                              // Note : the css rules are generated in Sek_Dyn_CSS_Builder::sek_add_rules_for_column_width
                              case 'sek-resize-columns' :
                                    if ( params.col_number < 2 )
                                      break;

                                    var resizedColumn = self.getLevelModel( params.resized_column, newSetValue.collection ),
                                        sistercolumn = self.getLevelModel( params.sister_column, newSetValue.collection );

                                    //api.infoLog( 'updateAPISetting => ' + params.action + ' => ', params );

                                    // SET RESIZED COLUMN WIDTH
                                    if ( 'no_match' == resizedColumn ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no resized column matched' );
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no resized column matched');
                                          break;
                                    }

                                    var _getColumnWidth = function( _candidate_ ) {
                                          var _width = '_not_set_';
                                          var _options = _.isObject( _candidate_.options ) ? _candidate_.options : {};
                                          if ( ! _.isEmpty( _options ) && _options.width && _options.width['custom-width'] ) {
                                                _width = parseFloat( _options.width['custom-width'] * 1 );
                                          }
                                          return _width;
                                    };

                                    var _setColumnWidth = function( _candidate_, newWidthValue ) {
                                          // start from a deep cloned object
                                          // important => fixes https://github.com/presscustomizr/nimble-builder/issues/455
                                          var _new_options_values = $.extend( true, {}, _candidate_.options || {} );

                                          _new_options_values.width = _.isObject( _new_options_values.width ) ? _new_options_values.width : {};
                                          _new_options_values.width['custom-width'] = newWidthValue;
                                          _candidate_.options = _new_options_values;

                                          // Live update the input value ( when rendered )
                                          $('body').find('[data-sek-width-range-column-id="'+ _candidate_.id +'"]').val( newWidthValue ).trigger('input', { is_resize_column_trigger : true } );
                                          return newWidthValue;
                                    };
                                    ///


                                    // DEPRECATED SINCE JUNE 2019 => resizedColumn.width = parseFloat( params.resizedColumnWidthInPercent );

                                    var resizedColumnWidthInPercent = _setColumnWidth( resizedColumn, parseFloat( params.resizedColumnWidthInPercent ) );
                                    // cast to number
                                    resizedColumnWidthInPercent = parseFloat( resizedColumnWidthInPercent );

                                    // SET OTHER COLUMNS WIDTH
                                    var parentSektion = self.getLevelModel( params.in_sektion, newSetValue.collection );
                                    var otherColumns = _.filter( parentSektion.collection, function( _col_ ) {
                                          return _col_.id != resizedColumn.id && _col_.id != sistercolumn.id;
                                    });
                                    var otherColumnsWidth = parseFloat( resizedColumnWidthInPercent.toFixed(3) );

                                    if ( ! _.isEmpty( otherColumns ) ) {
                                         _.each( otherColumns, function( colModel ) {
                                                currentColWidth = _getColumnWidth( colModel );
                                                if ( '_not_set_' === currentColWidth || ! _.isNumber( currentColWidth * 1 ) || _.isEmpty( currentColWidth + '' ) || 1 > currentColWidth ) {
                                                      // DEPRECATED SINCE JUNE 2019 => colModel.width = parseFloat( ( 100 / params.col_number ).toFixed(3) );
                                                      currentColWidth = _setColumnWidth( colModel, parseFloat( ( 100 / params.col_number ).toFixed(3) ) );
                                                }

                                                // sum up all other column's width, excluding the resized and sister one.
                                                otherColumnsWidth = parseFloat( ( otherColumnsWidth  +  currentColWidth ).toFixed(3) );
                                          });
                                    }

                                    // SET SISTER COLUMN WIDTH
                                    // sum up all other column's width, excluding the resized and sister one.
                                    // api.infoLog( "resizedColumn.width", resizedColumn.width  );
                                    // api.infoLog( "otherColumns", otherColumns );

                                    // then calculate the sistercolumn so we are sure that we feel the entire space of the sektion
                                    // DEPRECATED SINCE JUNE 2019 => sistercolumn.width = parseFloat( ( 100 - otherColumnsWidth ).toFixed(3) );
                                    _setColumnWidth( sistercolumn, parseFloat( ( 100 - otherColumnsWidth ).toFixed(3) ) );
                                    // api.infoLog('otherColumnsWidth', otherColumnsWidth );
                                    // api.infoLog("sistercolumn.width", sistercolumn.width );
                                    // api.infoLog( "sistercolumn.width + otherColumnsWidth" , Number( sistercolumn.width ) + Number( otherColumnsWidth ) );
                                    //api.infoLog('COLLECTION AFTER UPDATE ', parentSektion.collection );
                              break;




                              case 'sek-move-column' :
                                    var toSektionCandidate = self.getLevelModel( params.to_sektion, newSetValue.collection ),
                                        movedColumnCandidate,
                                        copyOfMovedColumnCandidate;

                                    if ( _.isEmpty( toSektionCandidate ) || 'no_match' == toSektionCandidate ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing target sektion' );
                                    }

                                    if ( params.from_sektion != params.to_sektion ) {
                                          // Remove the moved column from the source sektion
                                          var fromSektionCandidate = self.getLevelModel( params.from_sektion, newSetValue.collection );
                                          if ( _.isEmpty( fromSektionCandidate ) || 'no_match' == fromSektionCandidate ) {
                                                throw new Error( 'updateAPISetting => ' + params.action + ' => missing source column' );
                                          }

                                          fromSektionCandidate.collection =  _.isArray( fromSektionCandidate.collection ) ? fromSektionCandidate.collection : [];
                                          // Make a copy of the column candidate now, before removing it
                                          movedColumnCandidate = self.getLevelModel( params.id, fromSektionCandidate.collection );
                                          copyOfMovedColumnCandidate = $.extend( true, {}, movedColumnCandidate );
                                          // remove the column from its previous sektion
                                          fromSektionCandidate.collection = _.filter( fromSektionCandidate.collection, function( column ) {
                                                return column.id != params.id;
                                          });
                                          // Reset the column's width in the target sektion
                                          // _.each( fromSektionCandidate.collection, function( colModel ) {
                                          //       colModel.width = '';
                                          // });
                                          self.resetColumnsWidthInSection( fromSektionCandidate );
                                    }

                                    // update the target sektion
                                    toSektionCandidate.collection =  _.isArray( toSektionCandidate.collection ) ? toSektionCandidate.collection : [];
                                    originalCollection = $.extend( true, [], toSektionCandidate.collection );
                                    reorderedCollection = [];
                                    _.each( params.newOrder, function( _id_ ) {
                                          // in the case of a cross sektion movement, we need to add the moved column to the target sektion
                                          if ( params.from_sektion != params.to_sektion && _id_ == copyOfMovedColumnCandidate.id ) {
                                                reorderedCollection.push( copyOfMovedColumnCandidate );
                                          } else {
                                                columnCandidate = self.getLevelModel( _id_, originalCollection );
                                                if ( _.isEmpty( columnCandidate ) || 'no_match' == columnCandidate ) {
                                                      throw new Error( 'updateAPISetting => moveColumn => missing columnCandidate' );
                                                }
                                                reorderedCollection.push( columnCandidate );
                                          }
                                    });
                                    toSektionCandidate.collection = reorderedCollection;

                                    // Reset the column's width in the target sektion
                                    // _.each( toSektionCandidate.collection, function( colModel ) {
                                    //       colModel.width = '';
                                    // });
                                    self.resetColumnsWidthInSection( toSektionCandidate );

                              break;












                              //-------------------------------------------------------------------------------------------------
                              //-- MODULE
                              //-------------------------------------------------------------------------------------------------
                              case 'sek-add-module' :
                                    // an id must be provided
                                    if ( _.isEmpty( params.id ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing id' );
                                    }
                                    // a module_type must be provided
                                    if ( _.isEmpty( params.module_type ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing module_type' );
                                    }
                                    columnCandidate = self.getLevelModel( params.in_column, newSetValue.collection );
                                    if ( 'no_match' === columnCandidate ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no parent column matched' );
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no parent column matched');
                                          break;
                                    }

                                    var position = 0;
                                    columnCandidate.collection =  _.isArray( columnCandidate.collection ) ? columnCandidate.collection : [];
                                    // get the position of the before or after module
                                    _.each( columnCandidate.collection, function( moduleModel, index ) {
                                          if ( params.before_module === moduleModel.id ) {
                                                position = index;
                                          }
                                          if ( params.after_module === moduleModel.id ) {
                                                position = index + 1;
                                          }
                                    });

                                    var _moduleParams = {
                                          id : params.id,
                                          level : 'module',
                                          module_type : params.module_type,
                                          ver_ini : sektionsLocalizedData.nimbleVersion
                                    };
                                    // Let's add the starting value if provided when registrating the module
                                    startingModuleValue = self.getModuleStartingValue( params.module_type );
                                    if ( 'no_starting_value' !== startingModuleValue ) {
                                          _moduleParams.value = startingModuleValue;
                                    }

                                    columnCandidate.collection.splice( position, 0, _moduleParams );
                              break;

                              case 'sek-duplicate-module' :
                                    // an id must be provided
                                    if ( _.isEmpty( params.id ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing id' );
                                    }
                                    columnCandidate = self.getLevelModel( params.in_column, newSetValue.collection );
                                    if ( 'no_match' == columnCandidate ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no parent column matched' );
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no parent column matched');
                                          break;
                                    }

                                    columnCandidate.collection =  _.isArray( columnCandidate.collection ) ? columnCandidate.collection : [];

                                    var deepClonedModule;
                                    try { deepClonedModule = self.cloneLevel( params.id ); } catch( er ) {
                                          api.errare( 'updateAPISetting => ' + params.action, er );
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => error when cloning the level');
                                          break;
                                    }
                                    var insertInposition = self.getLevelPositionInCollection( params.id, newSetValue.collection );
                                    cloneId = deepClonedModule.id;//will be passed in resolve()
                                    columnCandidate.collection.splice( parseInt( insertInposition + 1, 10 ), 0, deepClonedModule );

                              break;

                              case 'sek-remove-module' :
                                    // an id must be provided
                                    if ( _.isEmpty( params.id ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing id' );
                                    }
                                    columnCandidate = self.getLevelModel( params.in_column, newSetValue.collection );
                                    if ( 'no_match' != columnCandidate ) {
                                          columnCandidate.collection =  _.isArray( columnCandidate.collection ) ? columnCandidate.collection : [];
                                          columnCandidate.collection = _.filter( columnCandidate.collection, function( module ) {
                                                return module.id != params.id;
                                          });

                                    } else {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no parent column matched' );
                                    }
                              break;

                              case 'sek-move-module' :
                                    var toColumnCandidate,
                                        movedModuleCandidate,
                                        copyOfMovedModuleCandidate;

                                    // loop on the sektions to find the toColumnCandidate
                                    // _.each( newSetValue.collection, function( _sektion_ ) {
                                    //       _.each( _sektion_.collection, function( _column_ ) {
                                    //             if ( _column_.id == params.to_column ) {
                                    //                  toColumnCandidate = _column_;
                                    //             }
                                    //       });
                                    // });
                                    toColumnCandidate = self.getLevelModel( params.to_column, newSetValue.collection );

                                    if ( _.isEmpty( toColumnCandidate ) || 'no_match' == toColumnCandidate ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing target column' );
                                    }

                                    // If the module has been moved to another column
                                    // => remove the moved module from the source column
                                    if ( params.from_column != params.to_column ) {
                                          var fromColumnCandidate;
                                          fromColumnCandidate = self.getLevelModel( params.from_column, newSetValue.collection );

                                          if ( _.isEmpty( fromColumnCandidate ) || 'no_match' == fromColumnCandidate ) {
                                                throw new Error( 'updateAPISetting => ' + params.action + ' => missing source column' );
                                          }

                                          fromColumnCandidate.collection =  _.isArray( fromColumnCandidate.collection ) ? fromColumnCandidate.collection : [];
                                          // Make a copy of the module candidate now, before removing it
                                          movedModuleCandidate = self.getLevelModel( params.id, newSetValue.collection );
                                          copyOfMovedModuleCandidate = $.extend( true, {}, movedModuleCandidate );
                                          // remove the module from its previous column
                                          fromColumnCandidate.collection = _.filter( fromColumnCandidate.collection, function( module ) {
                                                return module.id != params.id;
                                          });
                                    }// if params.from_column != params.to_column

                                    // update the target column
                                    toColumnCandidate.collection =  _.isArray( toColumnCandidate.collection ) ? toColumnCandidate.collection : [];
                                    originalCollection = $.extend( true, [], toColumnCandidate.collection );
                                    reorderedCollection = [];
                                    _.each( params.newOrder, function( _id_ ) {
                                          if ( params.from_column != params.to_column && _id_ == copyOfMovedModuleCandidate.id ) {
                                                reorderedCollection.push( copyOfMovedModuleCandidate );
                                          } else {
                                                moduleCandidate = self.getLevelModel( _id_, newSetValue.collection );
                                                if ( _.isEmpty( moduleCandidate ) || 'no_match' == moduleCandidate ) {
                                                      throw new Error( 'updateAPISetting => ' + params.action + ' => missing moduleCandidate' );
                                                }
                                                reorderedCollection.push( moduleCandidate );
                                          }
                                    });
                                    // Check if we have duplicates ?
                                    if ( reorderedCollection.length != _.uniq( reorderedCollection ).length ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => there are duplicated modules in column : ' + toColumnCandidate.id );
                                    } else {
                                          toColumnCandidate.collection = reorderedCollection;
                                    }
                              break;


                              case 'sek-set-module-value' :
                                    moduleCandidate = self.getLevelModel( params.id, newSetValue.collection );

                                    var _modValueCandidate = {};
                                    // consider only the non empty settings for db
                                    // booleans should bypass this check
                                    _.each( params.value || {}, function( _val_, _key_ ) {
                                          // Note : _.isEmpty( 5 ) returns true when checking an integer,
                                          // that's why we need to cast the _val_ to a string when using _.isEmpty()
                                          if ( ! _.isBoolean( _val_ ) && _.isEmpty( _val_ + "" ) )
                                            return;
                                          _modValueCandidate[ _key_ ] = _val_;
                                    });
                                    if ( 'no_match' == moduleCandidate ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no module matched', params );
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => error no module matched');
                                          break;
                                    }
                                    if ( _.isEmpty( params.options_type ) ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => missing options_type');
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => missing options_type');
                                          break;
                                    }

                                    // Is this a father module ?
                                    // If yes, the module value is structured by option group, each option group being updated by a child module
                                    // If no, the default option type is : '__no_option_group_to_be_updated_by_children_modules__'
                                    if ( '__no_option_group_to_be_updated_by_children_modules__' === params.options_type ) {
                                          moduleCandidate.value = _modValueCandidate;
                                    } else {
                                          // start from a deep cloned object
                                          // prevents issues like https://github.com/presscustomizr/nimble-builder/issues/455
                                          var _new_module_values = $.extend( true, {}, _.isEmpty( moduleCandidate.value ) ? {} : moduleCandidate.value );
                                          _new_module_values[ params.options_type ] = _modValueCandidate;
                                          moduleCandidate.value = _new_module_values;
                                    }

                              break;






                              //-------------------------------------------------------------------------------------------------
                              //-- LEVEL OPTIONS
                              //-------------------------------------------------------------------------------------------------
                              case 'sek-generate-level-options-ui' :
                                    var _candidate_ = self.getLevelModel( params.id, newSetValue.collection ),
                                        _valueCandidate = {};

                                    if ( 'no_match'=== _candidate_ ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no parent sektion matched' );
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no parent sektion matched');
                                          break;
                                    }
                                    // start from a deep cloned object
                                    // important => fixes https://github.com/presscustomizr/nimble-builder/issues/455
                                    var _new_options_values = $.extend( true, {}, _candidate_.options || {} );

                                    // consider only the non empty settings for db
                                    // booleans should bypass this check
                                    _.each( params.value || {}, function( _val_, _key_ ) {
                                          // Note : _.isEmpty( 5 ) returns true when checking an integer,
                                          // that's why we need to cast the _val_ to a string when using _.isEmpty()
                                          if ( ! _.isBoolean( _val_ ) && _.isEmpty( _val_ + "" ) )
                                            return;
                                          _valueCandidate[ _key_ ] = _val_;
                                    });

                                    if ( _.isEmpty( params.options_type ) ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => missing options_type');
                                    }

                                    _new_options_values[ params.options_type ] = _valueCandidate;
                                    _candidate_.options = _new_options_values;
                              break;





                              //-------------------------------------------------------------------------------------------------
                              //-- LOCAL SKOPE OPTIONS
                              //-------------------------------------------------------------------------------------------------
                              // Note : this is saved in "local_options"
                              case 'sek-generate-local-skope-options-ui' :
                                    _valueCandidate = {};

                                    var _currentOptions = $.extend( true, {}, _.isObject( newSetValue.local_options ) ? newSetValue.local_options : {} );
                                    // consider only the non empty settings for db
                                    // booleans should bypass this check
                                    _.each( params.value || {}, function( _val_, _key_ ) {
                                          // Note : _.isEmpty( 5 ) returns true when checking an integer,
                                          // that's why we need to cast the _val_ to a string when using _.isEmpty()
                                          if ( ! _.isBoolean( _val_ ) && _.isEmpty( _val_ + "" ) )
                                            return;
                                          _valueCandidate[ _key_ ] = _val_;
                                    });
                                    if ( _.isEmpty( params.options_type ) || ! _.isString( params.options_type ) ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => missing options_type');
                                    } else {
                                          var newOptionsValues = {};
                                          newOptionsValues[ params.options_type ] = _valueCandidate;
                                          newSetValue.local_options = $.extend( _currentOptions, newOptionsValues );
                                    }
                              break;









                              //-------------------------------------------------------------------------------------------------
                              //-- CONTENT IN NEW SEKTION
                              //-------------------------------------------------------------------------------------------------
                              // @params {
                              //   drop_target_element : $(this),
                              //   position : _position,// <= top or bottom
                              //   before_section : $(this).data('sek-before-section'),
                              //   after_section : $(this).data('sek-after-section'),
                              //   content_type : event.originalEvent.dataTransfer.getData( "sek-content-type" ), //<= module or preset_section
                              //   content_id : event.originalEvent.dataTransfer.getData( "sek-content-id" )
                              // }
                              case 'sek-add-content-in-new-sektion' :
                                    // api.infoLog('update API Setting => sek-add-content-in-new-sektion => PARAMS', params );
                                    // an id must be provided
                                    if ( _.isEmpty( params.id ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing id' );
                                    }
                                    // get the position of the before or after section
                                    position = 0;
                                    locationCandidate = self.getLevelModel( params.location, newSetValue.collection );
                                    if ( 'no_match' == locationCandidate ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no location matched' );
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no location matched');
                                          break;
                                    }
                                    locationCandidate.collection = _.isArray( locationCandidate.collection ) ? locationCandidate.collection : [];
                                    _.each( locationCandidate.collection, function( secModel, index ) {
                                          if ( params.before_section === secModel.id ) {
                                                position = index;
                                          }
                                          if ( params.after_section === secModel.id ) {
                                                position = index + 1;
                                          }
                                    });

                                    switch( params.content_type) {
                                          // When a module is dropped in a section + column structure to be generated
                                          case 'module' :
                                                // Let's add the starting value if provided when registrating the module
                                                // Note : params.content_id is the module_type
                                                startingModuleValue = self.getModuleStartingValue( params.content_id );

                                                // insert the section in the collection at the right place
                                                locationCandidate.collection.splice( position, 0, {
                                                      id : params.id,
                                                      level : 'section',
                                                      collection : [
                                                            {
                                                                  id : sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid(),
                                                                  level : 'column',
                                                                  collection : [
                                                                        {
                                                                              id : params.droppedModuleId,
                                                                              level : 'module',
                                                                              module_type : params.content_id,
                                                                              value : 'no_starting_value' !== startingModuleValue ? startingModuleValue : null,
                                                                              ver_ini : sektionsLocalizedData.nimbleVersion
                                                                        }
                                                                  ],
                                                                  ver_ini : sektionsLocalizedData.nimbleVersion
                                                            }
                                                      ],
                                                      ver_ini : sektionsLocalizedData.nimbleVersion
                                                });
                                          break;

                                          // When a preset section is dropped
                                          case 'preset_section' :
                                                // insert the section in the collection at the right place
                                                __presetSectionInjected__ = $.Deferred();//defined at the beginning of the method

                                                var _doWhenPresetSectionCollectionFetched = function( presetColumnCollection ) {
                                                      self.preparePresetSectionForInjection( presetColumnCollection )
                                                            .fail( function( _er_ ){
                                                                  __updateAPISettingDeferred__.reject( 'updateAPISetting => error when preparePresetSectionForInjection => ' + params.action + ' => ' + _er_ );
                                                                  // Used when updating the setting
                                                                  // @see end of this method
                                                                  __presetSectionInjected__.reject( _er_ );
                                                            })
                                                            .done( function( sectionReadyToInject ) {
                                                                  //api.infoLog( 'sectionReadyToInject', sectionReadyToInject );

                                                                  // If the preset_section is inserted in a an empty nested section, add it at the right place in the parent column of the nested section.
                                                                  // Otherwise, add the preset section at the right position in the parent location of the section.
                                                                  var insertedInANestedSektion = false;
                                                                  if ( ! _.isEmpty( params.sektion_to_replace ) ) {
                                                                        var sektionToReplace = self.getLevelModel( params.sektion_to_replace, newSetValue.collection );
                                                                        if ( 'no_match' === sektionToReplace ) {
                                                                              api.errare( 'updateAPISetting => ' + params.action + ' => no sektionToReplace matched' );
                                                                              __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no sektionToReplace matched');
                                                                        }
                                                                        insertedInANestedSektion = true === sektionToReplace.is_nested;
                                                                  }

                                                                  if ( ! insertedInANestedSektion ) {
                                                                        locationCandidate.collection.splice( position, 0, {
                                                                              id : params.id,
                                                                              level : 'section',
                                                                              collection : sectionReadyToInject.collection,
                                                                              options : sectionReadyToInject.options || {},
                                                                              ver_ini : sektionsLocalizedData.nimbleVersion
                                                                        });
                                                                  } else {
                                                                        columnCandidate = self.getLevelModel( params.in_column, newSetValue.collection );
                                                                        if ( 'no_match' === columnCandidate ) {
                                                                              api.errare( 'updateAPISetting => ' + params.action + ' => no parent column matched' );
                                                                              __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no parent column matched');
                                                                        }

                                                                        columnCandidate.collection =  _.isArray( columnCandidate.collection ) ? columnCandidate.collection : [];
                                                                        // get the position of the before or after module
                                                                        _.each( columnCandidate.collection, function( moduleOrSectionModel, index ) {
                                                                              if ( params.before_section === moduleOrSectionModel.id ) {
                                                                                    position = index;
                                                                              }
                                                                              if ( params.after_section === moduleOrSectionModel.id ) {
                                                                                    position = index + 1;
                                                                              }
                                                                        });
                                                                        columnCandidate.collection.splice( position, 0, {
                                                                              id : params.id,
                                                                              is_nested : true,
                                                                              level : 'section',
                                                                              collection : sectionReadyToInject.collection,
                                                                              options : sectionReadyToInject.options || {},
                                                                              ver_ini : sektionsLocalizedData.nimbleVersion
                                                                        });
                                                                  }

                                                                  // Used when updating the setting
                                                                  // @see end of this method
                                                                  __presetSectionInjected__.resolve();
                                                            });// self.preparePresetSectionForInjection.done()
                                                };//_doWhenPresetSectionCollectionFetched()


                                                // Try to fetch the sections from the server
                                                // if sucessfull, resolve __presetSectionInjected__.promise()
                                                self.getPresetSectionCollection({
                                                            is_user_section : params.is_user_section,
                                                            presetSectionId : params.content_id,
                                                            section_id : params.id//<= we need to use the section id already generated, and passed for ajax action @see ::reactToPreviewMsg, case "sek-add-section"
                                                      })
                                                      .fail( function( _er_ ) {
                                                            api.errare( 'updateAPISetting => ' + params.action + ' => Error with self.getPresetSectionCollection()', _er_ );
                                                            __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => Error with self.getPresetSectionCollection()');
                                                      })
                                                      .done( function( presetColumnCollection ) {
                                                            if ( ! _.isObject( presetColumnCollection ) || _.isEmpty( presetColumnCollection ) ) {
                                                                  api.errare( 'updateAPISetting => ' + params.action + ' => preset section type not found or empty : ' + params.content_id, presetColumnCollection );
                                                                  __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => preset section type not found or empty');
                                                            }
                                                            // OK. time to resolve __presetSectionInjected__.promise()
                                                            _doWhenPresetSectionCollectionFetched( presetColumnCollection );
                                                      });//self.getPresetSectionCollection().done()
                                          break;
                                    }//switch( params.content_type)
                              break;



                              //-------------------------------------------------------------------------------------------------
                              //-- CONTENT IN NEW NESTED SEKTION
                              //-------------------------------------------------------------------------------------------------
                              // @params {
                              //   drop_target_element : $(this),
                              //   position : _position,// <= top or bottom
                              //   before_section : $(this).data('sek-before-section'),
                              //   after_section : $(this).data('sek-after-section'),
                              //   content_type : event.originalEvent.dataTransfer.getData( "sek-content-type" ), //<= module or preset_section
                              //   content_id : event.originalEvent.dataTransfer.getData( "sek-content-id" )
                              // }
                              case 'sek-add-preset-section-in-new-nested-sektion' :
                                    // an id must be provided
                                    if ( _.isEmpty( params.id ) ) {
                                          throw new Error( 'updateAPISetting => ' + params.action + ' => missing id' );
                                    }

                                    columnCandidate = self.getLevelModel( params.in_column, newSetValue.collection );

                                    // can we add this nested sektion ?
                                    // if the parent sektion of the column has is_nested = true, then we can't
                                    parentSektionCandidate = self.getLevelModel( params.in_sektion, newSetValue.collection );
                                    if ( 'no_match' == parentSektionCandidate ) {
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no grand parent sektion found');
                                          break;
                                    }
                                    if ( true === parentSektionCandidate.is_nested ) {
                                          __updateAPISettingDeferred__.reject( sektionsLocalizedData.i18n[ "You've reached the maximum number of allowed nested sections." ]);
                                          break;
                                    }
                                    if ( 'no_match' == columnCandidate ) {
                                          api.errare( 'updateAPISetting => ' + params.action + ' => no parent column matched' );
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => no parent column matched');
                                          break;
                                    }
                                    columnCandidate.collection =  _.isArray( columnCandidate.collection ) ? columnCandidate.collection : [];

                                    // insert the section in the collection at the right place
                                    var presetColumnCollection;
                                    __presetSectionInjected__ = $.Deferred();//defined at the beginning of the method

                                    _doWhenPresetSectionCollectionFetched = function( presetColumnCollection ) {
                                          self.preparePresetSectionForInjection( presetColumnCollection )
                                                .fail( function( _er_ ){
                                                      __updateAPISettingDeferred__.reject( 'updateAPISetting => error when preparePresetSectionForInjection => ' + params.action + ' => ' + _er_ );
                                                      // Used when updating the setting
                                                      // @see end of this method
                                                      __presetSectionInjected__.reject( _er_ );
                                                })
                                                .done( function( sectionReadyToInject ) {
                                                      columnCandidate.collection.push({
                                                            id : params.id,
                                                            level : 'section',
                                                            collection : sectionReadyToInject.collection,
                                                            options : sectionReadyToInject.options || {},
                                                            is_nested : true,
                                                            ver_ini : sektionsLocalizedData.nimbleVersion
                                                      });

                                                      // Used when updating the setting
                                                      // @see end of this method
                                                      __presetSectionInjected__.resolve();
                                                });//self.preparePresetSectionForInjection.done()
                                    };//_doWhenPresetSectionCollectionFetched


                                    // Try to fetch the sections from the server
                                    // if sucessfull, resolve __presetSectionInjected__.promise()
                                    self.getPresetSectionCollection({
                                                is_user_section : params.is_user_section,
                                                presetSectionId : params.content_id,
                                                section_id : params.id//<= we need to use the section id already generated, and passed for ajax action @see ::reactToPreviewMsg, case "sek-add-section"
                                          })
                                          .fail( function() {
                                                api.errare( 'updateAPISetting => ' + params.action + ' => Error with self.getPresetSectionCollection()', _er_ );
                                                __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => Error with self.getPresetSectionCollection()');
                                          })
                                          .done( function( presetColumnCollection ) {
                                                if ( ! _.isObject( presetColumnCollection ) || _.isEmpty( presetColumnCollection ) ) {
                                                      api.errare( 'updateAPISetting => ' + params.action + ' => preset section type not found or empty : ' + params.content_id, presetColumnCollection );
                                                      __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => preset section type not found or empty');
                                                }
                                                // OK. time to resolve __presetSectionInjected__.promise()
                                                _doWhenPresetSectionCollectionFetched( presetColumnCollection );
                                          });//self.getPresetSectionCollection().done()
                              break;












                              //-------------------------------------------------------------------------------------------------
                              //-- POPULATE GOOGLE FONTS
                              //-------------------------------------------------------------------------------------------------
                              //@params {
                              //       action : 'sek-update-fonts',
                              //       font_family : newFontFamily,
                              // }
                              case 'sek-update-fonts' :
                                    // Get the gfonts from the level options and modules values
                                    var currentGfonts = self.sniffGFonts( { is_global_location : ( params && true === params.is_global_location ) } );
                                    if ( ! _.isEmpty( params.font_family ) && _.isString( params.font_family ) && ! _.contains( currentGfonts, params.font_family ) ) {
                                          if ( params.font_family.indexOf('gfont') < 0 ) {
                                                api.errare( 'updateAPISetting => ' + params.action + ' => error => must be a google font, prefixed gfont' );
                                                __updateAPISettingDeferred__.reject( 'updateAPISetting => ' + params.action + ' => error => must be a google font, prefixed gfont');
                                                break;
                                          }
                                          currentGfonts.push( params.font_family );
                                    }
                                    // update the global gfonts collection
                                    // this is then used server side in Sek_Dyn_CSS_Handler::sek_get_gfont_print_candidates to build the Google Fonts request
                                    newSetValue.fonts = currentGfonts;
                              break;

                              //-------------------------------------------------------------------------------------------------
                              //-- RESTORE A REVISION
                              //-------------------------------------------------------------------------------------------------
                              case 'sek-restore-revision' :
                                    //api.infoLog( 'sek-restore-revision', params );
                                    newSetValue = params.revision_value;
                              break;

                              //-------------------------------------------------------------------------------------------------
                              //-- FILE IMPORT
                              //-------------------------------------------------------------------------------------------------
                              case 'sek-import-from-file' :
                                    api.infoLog( 'sek-import-from-file', params );
                                    if ( _.isUndefined( params.imported_content.data ) || _.isUndefined( params.imported_content.metas ) ) {
                                          api.errare( 'updateAPISetting::sek-import-from-file => invalid imported content', imported_content );
                                          break;
                                    }

                                    var importedCollection = _.isArray( params.imported_content.data.collection ) ? $.extend( true, [], params.imported_content.data.collection ) : [];

                                    // SHALL WE ASSIGN SECTIONS FROM MISSING LOCATIONS TO THE FIRST ACTIVE LOCATION ?
                                    // For example the current page has only the 'loop_start' location, whereas the imported content includes 3 locations :
                                    // - after_header
                                    // - loop_start
                                    // - before_footer
                                    // Among those 3 locations, 2 are not active in the page.
                                    // We will merge all section collections from the 3 imported locations one new collection, that will be assigned to 'loop_start'
                                    // Note that the active imported locations are ordered like they were on the page when exported.
                                    //
                                    // So :
                                    // 1) identify the first active location of the page
                                    // 2) populate a new collection of combined sections from all active imported locations.
                                    // 3) updated the imported collection with this
                                    if ( true === params.assign_missing_locations ) {
                                          var importedActiveLocations = params.imported_content.metas.active_locations,
                                              currentActiveLocations = api.czr_sektions.activeLocations();

                                          // console.log('Current set value ?', api( _collectionSettingId_ )() );
                                          // console.log('import params', params );
                                          // console.log('importedCollection?', importedCollection );
                                          // console.log('importedActiveLocations', importedActiveLocations );

                                          // first active location of the current setting
                                          var firstCurrentActiveLocationId = _.first( currentActiveLocations );

                                          if ( !_.isEmpty( firstCurrentActiveLocationId ) && !_.isEmpty( importedActiveLocations ) && _.isArray( importedActiveLocations ) ) {
                                                // importedActiveLocationsNotAvailableInCurrentActiveLocations
                                                // Example :
                                                // active location in the page : loop_start, loop_end
                                                // active locations imported : after_header, loop_start, before_footer
                                                // importedActiveLocationsNotAvailableInCurrentActiveLocations => after_header, before_footer
                                                var importedActiveLocationsNotAvailableInCurrentActiveLocations = $(importedActiveLocations).not(currentActiveLocations).get(),
                                                    firstCurrentLocationData = self.getLevelModel( firstCurrentActiveLocationId, newSetValue.collection ),
                                                    importedTargetLocationData = self.getLevelModel( firstCurrentActiveLocationId, params.imported_content.data.collection ),
                                                    newCollectionForTargetLocation = [];// the collection that will hold the merge of all active imported collections

                                                // normalize
                                                // => make sure we have a collection array, even empty
                                                firstCurrentLocationData.collection = _.isArray( firstCurrentLocationData.collection ) ? firstCurrentLocationData.collection : [];
                                                importedTargetLocationData.collection = _.isArray( importedTargetLocationData.collection ) ? importedTargetLocationData.collection : [];

                                                // loop on the active imported locations
                                                // Example : ["__after_header", "__before_main_wrapper", "loop_start", "__before_footer"]
                                                // and populate newCollectionForTargetLocation, with locations ordered as they were on export
                                                // importedCollection is a clone
                                                _.each( importedActiveLocations, function( impLocationId ){
                                                      var impLocationData = self.getLevelModel( impLocationId, importedCollection );
                                                      if ( _.isEmpty( impLocationData.collection ) )
                                                        return;
                                                      newCollectionForTargetLocation = _.union( newCollectionForTargetLocation, impLocationData.collection );
                                                });//_.each( importedActiveLocations

                                                // replace the previous collection of the target location, by the union of all collections.
                                                // for example, if 'loop_start' is the target location, all sections will be added to it.
                                                importedTargetLocationData.collection = newCollectionForTargetLocation;

                                                // remove the missing locations from the imported collection
                                                // importedActiveLocationsNotAvailableInCurrentActiveLocations
                                                params.imported_content.data.collection = _.filter( params.imported_content.data.collection, function( _location ) {
                                                      return !_.contains( importedActiveLocationsNotAvailableInCurrentActiveLocations, _location.id );
                                                });
                                          }//if ( !_.isEmpty( firstCurrentActiveLocationId ) )
                                    }//if ( true === params.assign_missing_locations )


                                    // SHALL WE MERGE ?
                                    // loop on each location of the imported content
                                    // if the current setting value has sections in a location, add them before the imported ones
                                    // keep_existing_sections is a user check option
                                    // @see PHP sek_get_module_params_for_sek_local_imp_exp()
                                    if ( true === params.keep_existing_sections ) {
                                        // note that importedCollection is a unlinked clone of params.imported_content.data.collection
                                        // merge sections
                                        _.each( importedCollection, function( imp_location_data ) {
                                              var currentLocationData = self.getLevelModel( imp_location_data.id, newSetValue.collection );
                                              if ( _.isEmpty( currentLocationData.collection ) )
                                                return;

                                              var importedLocationData = self.getLevelModel( imp_location_data.id, params.imported_content.data.collection );
                                              importedLocationData.collection = _.union( currentLocationData.collection, importedLocationData.collection );
                                        });

                                        // merge fonts if needed
                                        if ( newSetValue.fonts && !_.isEmpty( newSetValue.fonts ) && _.isArray( newSetValue.fonts ) ) {
                                              params.imported_content.data.fonts = _.isArray( params.imported_content.data.fonts ) ? params.imported_content.data.fonts : [];
                                              // merge and remove duplicated fonts
                                              params.imported_content.data.fonts =  _.uniq( _.union( newSetValue.fonts, params.imported_content.data.fonts ) );
                                        }
                                    }// if true === params.merge

                                    newSetValue = params.imported_content.data;
                              break;

                              //-------------------------------------------------------------------------------------------------
                              //-- RESET COLLECTION, LOCAL OR GLOBAL
                              //-------------------------------------------------------------------------------------------------
                              case 'sek-reset-collection' :
                                    //api.infoLog( 'sek-import-from-file', params );
                                    try { newSetValue = api.czr_sektions.resetCollectionSetting( params.scope ); } catch( er ) {
                                          api.errare( 'sek-reset-collection => error when firing resetCollectionSetting()', er );
                                    }
                              break;
                        }// switch



                        // if we did not already rejected the request, let's check if the setting object has actually been modified
                        // at this point it should have been.
                        if ( 'pending' == __updateAPISettingDeferred__.state() ) {
                              var mayBeUpdateSektionsSetting = function() {

                                    // When a sektion setting is changed, "from" and "to" are passed to the .settingParams property
                                    // settingParams : {
                                    //       to : to,
                                    //       from : from,
                                    //       args : args
                                    // }
                                    // @see for example ::generateUIforFrontModules or ::generateUIforLevelOptions
                                    var isSettingValueChangeCase = params.settingParams && params.settingParams.from && params.settingParams.to;
                                    // in a setting value change case, the from and to must be different
                                    // implemented when fixing https://github.com/presscustomizr/nimble-builder/issues/455
                                    if ( isSettingValueChangeCase && _.isEqual( params.settingParams.from, params.settingParams.to ) ) {
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => the new setting value is unchanged when firing action : ' + params.action );
                                    } else if ( ! isSettingValueChangeCase && _.isEqual( currentSetValue, newSetValue ) ) {
                                          __updateAPISettingDeferred__.reject( 'updateAPISetting => the new setting value is unchanged when firing action : ' + params.action );
                                    } else {
                                          if ( null !== self.validateSettingValue( newSetValue, params.is_global_location ? 'global' : 'local' ) ) {
                                                api( _collectionSettingId_ )( newSetValue, params );
                                                // Add the cloneId to the params when we resolve
                                                // the cloneId is only needed in the duplication scenarii
                                                params.cloneId = cloneId;
                                                __updateAPISettingDeferred__.resolve( params );
                                          } else {
                                                __updateAPISettingDeferred__.reject( 'Validation problem for action ' + params.action );
                                          }
                                          //api.infoLog('COLLECTION SETTING UPDATED => ', _collectionSettingId_, api( _collectionSettingId_ )() );
                                    }
                              };//mayBeUpdateSektionsSetting()

                              // For all scenarios but section injection, we can update the sektion setting now
                              // otherwise we need to wait for the injection to be processed asynchronously
                              // CRITICAL => __updateAPISettingDeferred__ has to be resolved / rejected
                              // otherwise this can lead to scenarios where a change is not taken into account in ::updateAPISettingAndExecutePreviewActions
                              // like in https://github.com/presscustomizr/nimble-builder/issues/373
                              if ( '_not_injection_scenario_' === __presetSectionInjected__ ) {
                                    mayBeUpdateSektionsSetting();
                                    // At this point the __updateAPISettingDeferred__ obj can't be in a 'pending' state
                                    if ( 'pending' === __updateAPISettingDeferred__.state() ) {
                                          api.errare( '::updateAPISetting => The __updateAPISettingDeferred__ promise has not been resolved properly.');
                                    }
                              } else {
                                    __presetSectionInjected__
                                          .done( function() {
                                               mayBeUpdateSektionsSetting();
                                               // At this point the __updateAPISettingDeferred__ obj can't be in a 'pending' state
                                               if ( 'pending' === __updateAPISettingDeferred__.state() ) {
                                                    api.errare( '::updateAPISetting => The __updateAPISettingDeferred__ promise has not been resolved properly.');
                                               }
                                          })
                                          .fail( function( _er_ ) {
                                                api.errare( 'updateAPISetting => __presetSectionInjected__ failed', _er_ );
                                          });
                              }
                        }
                  };//_do_update_setting_id()


                  // Update the sektion collection
                  api( _collectionSettingId_, function( sektionSetInstance ) {
                        _do_update_setting_id();
                  });
                  return __updateAPISettingDeferred__.promise();
            },//updateAPISetting


            // used on :
            // - add column
            // - remove column
            // - duplicate column
            // - move column
            // added in June 2019 for https://github.com/presscustomizr/nimble-builder/issues/279
            resetColumnsWidthInSection : function( sektionCandidate ) {
                  // RESET ALL COLUMNS WIDTH
                  _.each( sektionCandidate.collection, function( colModel ) {
                        if ( colModel.options && colModel.options.width && colModel.options.width['custom-width'] ) {
                              colModel.options.width = _.omit( colModel.options.width, 'custom-width' );
                        }
                        colModel.width = '';// For backward compat since June 2019
                  });
            },


            // @return a promise()
            // caches the sections in api.sek_presetSections when api.section( '__content_picker__') is registered
            // caches the user saved sections on the first drag and drop of a user-saved section
            // @params {
            //  is_user_section : sectionParams.is_user_section
            //  preset_section_id : '' <= used for user_saved section
            // }
            _maybeFetchSectionsFromServer : function( params ) {
                  var dfd = $.Deferred(),
                      _ajaxRequest_;

                  params = params || { is_user_section : false };
                  if ( true === params.is_user_section ) {
                        if ( ! _.isEmpty( api.sek_userSavedSections ) && ! _.isEmpty( api.sek_userSavedSections[ params.preset_section_id ] ) ) {
                              dfd.resolve( api.sek_userSavedSections );
                        } else {
                              api.sek_userSavedSections = api.sek_userSavedSections || {};
                              if ( ! _.isUndefined( api.sek_fetchingUserSavedSections ) && 'pending' == api.sek_fetchingUserSavedSections.state() ) {
                                    _ajaxRequest_ = api.sek_fetchingUserSavedSections;
                              } else {
                                    _ajaxRequest_ = wp.ajax.post( 'sek_get_user_saved_sections', {
                                          nonce: api.settings.nonce.save,
                                          preset_section_id : params.preset_section_id
                                    });
                                    api.sek_fetchingUserSavedSections = _ajaxRequest_;
                              }
                              _ajaxRequest_.done( function( _sectionData_ ) {
                                    //api.sek_presetSections = JSON.parse( _collection_ );
                                    api.sek_userSavedSections[ params.preset_section_id ] = _sectionData_;
                                    dfd.resolve( api.sek_userSavedSections );
                              }).fail( function( _r_ ) {
                                    dfd.reject( _r_ );
                              });
                        }
                  } else {
                        if ( ! _.isEmpty( api.sek_presetSections ) ) {
                              dfd.resolve( api.sek_presetSections );
                        } else {
                              if ( ! _.isUndefined( api.sek_fetchingPresetSections ) && 'pending' == api.sek_fetchingPresetSections.state() ) {
                                    _ajaxRequest_ = api.sek_fetchingPresetSections;
                              } else {
                                    _ajaxRequest_ = wp.ajax.post( 'sek_get_preset_sections', { nonce: api.settings.nonce.save } );
                                    api.sek_fetchingPresetSections = _ajaxRequest_;
                              }
                              _ajaxRequest_.done( function( _collection_ ) {
                                    //api.sek_presetSections = JSON.parse( _collection_ );
                                    api.sek_presetSections = _collection_;
                                    dfd.resolve( api.sek_presetSections );
                              }).fail( function( _r_ ) {
                                    dfd.reject( _r_ );
                              });
                        }
                  }

                  return dfd.promise();
            },




            // First run : fetches the collection from the server
            // Next runs : uses the cached collection
            //
            // @return a JSON parsed string,
            // + guid() ids for each levels
            // ready for insertion
            //
            // @sectionParams : {
            //       is_user_section : bool, //<= is this section a "saved" section ?
            //       presetSectionId : params.content_id,
            //       section_id : params.id
            // }
            // Why is the section_id provided ?
            // Because this id has been generated ::reactToPreviewMsg, case "sek-add-section", and is the identifier that we'll need when ajaxing ( $_POST['id'])
            getPresetSectionCollection : function( sectionParams ) {
                  var self = this,
                      __dfd__ = $.Deferred();

                  self._maybeFetchSectionsFromServer({
                        is_user_section : sectionParams.is_user_section,
                        preset_section_id : sectionParams.presetSectionId
                  })
                        .fail( function( er ) {
                              __dfd__.reject( er );
                        })
                        .done( function( _collection_ ) {
                              //api.infoLog( 'preset_sections fetched', api.sek_presetSections );
                              var presetSection,
                                  allPresets = $.extend( true, {}, _.isObject( _collection_ ) ? _collection_ : {} );

                              if ( _.isEmpty( allPresets ) ) {
                                    throw new Error( 'getPresetSectionCollection => Invalid collection');
                              }
                              if ( _.isEmpty( allPresets[ sectionParams.presetSectionId ] ) ) {
                                    throw new Error( 'getPresetSectionCollection => the preset section : "' + sectionParams.presetSectionId + '" has not been found in the collection');
                              }
                              var presetCandidate = allPresets[ sectionParams.presetSectionId ];

                              // Ensure we have a string that's JSON.parse-able
                              // if ( typeof presetCandidate !== 'string' || presetCandidate[0] !== '{' ) {
                              //       throw new Error( 'getPresetSectionCollection => ' + sectionParams.presetSectionId + ' is not JSON.parse-able');
                              // }
                              // presetCandidate = JSON.parse( presetCandidate );

                              var setIds = function( collection ) {
                                    _.each( collection, function( levelData ) {
                                          levelData.id = sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid();
                                          if ( _.isArray( levelData.collection ) ) {
                                                setIds( levelData.collection );
                                          }
                                    });
                                    return collection;
                              };

                              var setVersion = function( collection ) {
                                    _.each( collection, function( levelData ) {
                                          levelData.ver_ini = sektionsLocalizedData.nimbleVersion;
                                          if ( _.isArray( levelData.collection ) ) {
                                                setVersion( levelData.collection );
                                          }
                                    });
                                    return collection;
                              };

                              // ID's
                              // set the section id provided.
                              presetCandidate.id = sectionParams.section_id;
                              // the other level's id have to be generated
                              presetCandidate.collection = setIds( presetCandidate.collection );

                              // NIMBLE VERSION
                              // set the section version
                              presetCandidate.ver_ini = sektionsLocalizedData.nimbleVersion;
                              // the other level's version have to be added
                              presetCandidate.collection = setVersion( presetCandidate.collection );
                              __dfd__.resolve( presetCandidate );
                        });//_maybeFetchSectionsFromServer.done()

                  return __dfd__.promise();
            },




            // Walk the column collection of a preset section, and replace '__img_url__*' pattern by image ids that we get from ajax calls
            // Is designed to handle multiple ajax calls in parallel if the preset_section includes several images
            // @return a promise()
            preparePresetSectionForInjection : function( columnCollection ) {
                var self = this,
                    deferreds = {},
                    preparedSection = {},
                    _dfd_ = $.Deferred();

                // walk the column collection and populates the deferreds object recursively
                var _sniffImg = function( data ) {
                      _.each( data, function( val, key ) {
                            if ( _.isObject( val ) || _.isArray( val ) ) {
                                  _sniffImg( val );
                            } else if ( _.isString( val ) && -1 != val.indexOf( '__img_url__' ) ) {
                                  // scenario when a section uses an image more than once.
                                  // => we don't need to fire a new ajax request for an image already sniffed
                                  if ( ! _.has( deferreds, val ) ) {
                                        deferreds[ val ] = self.importAttachment( val.replace( '__img_url__', '' ) );
                                  }
                            }
                      });
                      return deferreds;
                };

                // walk the column collection and populates the deferreds object recursively
                // imdList is formed this way :
                // __img_url__/assets/img/1.jpg : {id: 2547, url: "http://customizr-dev.test/wp-content/uploads/2018/09/nimble_asset_1.jpg"}
                // __img_url__/assets/img/2.jpg : {id: 2548, url: "http://customizr-dev.test/wp-content/uploads/2018/09/nimble_asset_2.jpg"}
                // __img_url__/assets/img/3.jpg : {id: 2549, url: "http://customizr-dev.test/wp-content/uploads/2018/09/nimble_asset_3.jpg"}
                var _replaceImgPlaceholderById = function( data, imgList) {
                      _.each( data, function( val, key ) {
                            if ( _.isObject( val ) || _.isArray( val ) ) {
                                  _replaceImgPlaceholderById( val, imgList );
                            } else if ( _.isString( val ) && -1 != val.indexOf( '__img_url__' ) && _.has( imgList, val ) && _.isObject( imgList[ val ] ) ) {
                                  data[ key ] = imgList[ val ].id;
                            }
                      });
                      return columnCollection;
                };

                self.whenAllPromisesInParallel( _sniffImg( columnCollection ) )
                    .done( function( imgList ) {
                          var imgReadySection = _replaceImgPlaceholderById( columnCollection, imgList );
                          _dfd_.resolve( imgReadySection );
                    })
                    .fail( function( _er_ ){
                          _dfd_.reject( _er_ );
                    });

                return _dfd_.promise();
            }
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            //@return void()
            // clean registered controls, sections, panels
            // only elements that have a true "track" param on registration are populated in the registered() collection
            // if the _id_ param is not specified, all registered controls, sections and panels are removed.
            //
            // preserve the settings => because this is where the customizer changeset of values is persisted before publishing
            // typically fired before updating the ui. @see ::generateUI()
            cleanRegistered : function( _id_ ) {
                  var self = this,
                      registered = $.extend( true, [], self.registered() || [] );

                  // added for https://github.com/presscustomizr/nimble-builder/issues/403
                  // in order to remove all instantiations of WP editor
                  // @see ::initialize()
                  api.trigger('sek-before-clean-registered');

                  registered = _.filter( registered, function( _reg_ ) {
                        if ( 'setting' !== _reg_.what ) {
                              if ( api[ _reg_.what ].has( _reg_.id ) ) {
                                    if ( ! _.isEmpty( _id_ ) && _reg_.id !== _id_ )
                                      return;
                                    // fire an event before removal, can be used to clean some jQuery plugin instance for example
                                    if (  _.isFunction( api[ _reg_.what ]( _reg_.id ).trigger ) ) {//<= Section and Panel constructor are not extended with the Event class, that's why we check if this method exists
                                           self.trigger( 'sek-ui-pre-removal', { what : _reg_.what, id : _reg_.id } );
                                    }
                                    $.when( api[ _reg_.what ]( _reg_.id ).container.remove() ).done( function() {
                                          // remove control, section, panel
                                          api[ _reg_.what ].remove( _reg_.id );
                                          // useful event, used to destroy the $ drop plugin instance for the section / module picker
                                          self.trigger( 'sek-ui-removed', { what : _reg_.what, id : _reg_.id } );
                                    });
                              }
                        }
                        return _reg_.what === 'setting';
                  });
                  self.registered( registered );
            },

            // This action can be fired after an import, to update the local settings with the imported values
            cleanRegisteredLocalOptionSettings : function() {
                  var self = this,
                      localOptionPrefix = self.getLocalSkopeOptionId(),
                      registered = $.extend( true, [], self.registered() || [] );

                  registered = _.filter( registered, function( _reg_ ) {
                        // Remove the local setting
                        if ( _reg_.id && -1 !== _reg_.id.indexOf( localOptionPrefix ) && api.has( _reg_.id ) ) {
                               api.remove( _reg_.id );
                        }
                        // keep only the setting not local
                        return _reg_.id && -1 === _reg_.id.indexOf( localOptionPrefix );
                  });
                  self.registered( registered );
            },


            // Keep only the settings for global option, local options, content picker
            // Remove all the other
            // The level ( section, column module ) settings can be identified because they are registered with a level property
            cleanRegisteredLevelSettingsAfterHistoryNavigation : function() {
                  var self = this,
                      registered = $.extend( true, [], self.registered() || [] );

                  registered = _.filter( registered, function( _reg_ ) {
                        // We check if the level property is empty
                        // if not empty, we can remove the setting from the api.
                        if ( ! _.isEmpty( _reg_.level ) && 'setting' === _reg_.what && api.has( _reg_.id ) ) {
                              // remove setting from the api
                              api.remove( _reg_.id );
                        }
                        // we keep only the setting with
                        // so we preserve the permanent options like global options, local options, content picker
                        return _.isEmpty( _reg_.level ) && 'setting' === _reg_.what ;
                  });
                  self.registered( registered );
            }

      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            // @eturn void()
            rootPanelFocus : function() {
                  //close everything
                  if ( api.section.has( api.czr_activeSectionId() ) ) {
                        api.section( api.czr_activeSectionId() ).expanded( false );
                  } else {
                        api.section.each( function( _s ) {
                            _s.expanded( false );
                        });
                  }
                  api.panel.each( function( _p ) {
                        _p.expanded( false );
                  });
            },

            //@return a global unique identifier
            guid : function() {
                  function s4() {
                        return Math.floor((1 + Math.random()) * 0x10000)
                          .toString(16)
                          .substring(1);
                  }
                  return s4() + s4() + s4();//s4() + s4() + s4() + s4() + s4() + s4();
            },

            //@return a string "nimble___[skp__global]"
            getGlobalSectionsSettingId : function() {
                  return sektionsLocalizedData.settingIdForGlobalSections;
            },

            // @params = { id : '', level : '' }
            // Recursively walk the level tree until a match is found
            // @return the level model object
            getLevelModel : function( id, collection ) {
                  var self = this, _data_ = 'no_match',
                      // @param id mandatory
                      // @param collection mandatory
                      // @param collectionSettingId optional
                      // @param localOrGlobal optional
                      _walk_ = function( id, collection, collectionSettingId, localOrGlobal ) {
                            // do we have a collection ?
                            // if not, let's use the root one
                            if ( _.isUndefined( collection ) ) {
                                  var currentSektionSettingValue = api( collectionSettingId )();
                                  var sektionSettingValue = _.isObject( currentSektionSettingValue ) ? $.extend( true, {}, currentSektionSettingValue ) : $.extend( true, {}, self.getDefaultSektionSettingValue( localOrGlobal ) );
                                  collection = _.isArray( sektionSettingValue.collection ) ? sektionSettingValue.collection : [];
                            }
                            _.each( collection, function( levelData ) {
                                  // did we found a match recursively ?
                                  if ( 'no_match' != _data_ )
                                    return;
                                  if ( id === levelData.id ) {
                                        _data_ = levelData;
                                  } else {
                                        if ( _.isArray( levelData.collection ) ) {
                                              _walk_( id, levelData.collection, collectionSettingId, localOrGlobal );
                                        }
                                  }
                            });
                            return _data_;
                      };

                  // if a collection has been provided in the signature, let's walk it.
                  // Otherwise, let's walk the local and global ones until a match is found.
                  if ( ! _.isEmpty( collection ) ) {
                        _walk_( id, collection );
                  } else {
                        _.each( {
                              local : self.localSectionsSettingId(),
                              global : self.getGlobalSectionsSettingId()
                        }, function( collectionSettingId, localOrGlobal ) {
                              if ( 'no_match' === _data_ ) {
                                    _walk_( id, collection, collectionSettingId, localOrGlobal );
                              }
                        });
                  }

                  return _data_;
            },


            // @params = { id : '', level : '' }
            // Recursively walk the level tree until a match is found
            // @return the level model object
            getParentSectionFromColumnId : function( id, collection ) {
                  var self = this, _section_model_ = 'no_match',
                      // @param id mandatory
                      // @param collection mandatory
                      // @param collectionSettingId optional
                      // @param localOrGlobal optional
                      _walk_ = function( id, collection, collectionSettingId, localOrGlobal ) {
                            // do we have a collection ?
                            // if not, let's use the root one
                            if ( _.isUndefined( collection ) ) {
                                  var currentSektionSettingValue = api( collectionSettingId )();
                                  var sektionSettingValue = _.isObject( currentSektionSettingValue ) ? $.extend( true, {}, currentSektionSettingValue ) : $.extend( true, {}, self.getDefaultSektionSettingValue( localOrGlobal ) );
                                  collection = _.isArray( sektionSettingValue.collection ) ? sektionSettingValue.collection : [];
                            }
                            _.each( collection, function( levelData ) {
                                  // did we found a match recursively ?
                                  if ( 'no_match' != _section_model_ )
                                    return;

                                  var colCandidate;
                                  if ( 'section' == levelData.level ) {
                                        colCandidate = _.findWhere( levelData.collection, { id : id });
                                  }
                                  if ( ! _.isEmpty( colCandidate ) ) {
                                        // we found our column in this section
                                        _section_model_ = levelData;
                                  } else {
                                        if ( _.isArray( levelData.collection ) ) {
                                              _walk_( id, levelData.collection, collectionSettingId, localOrGlobal );
                                        }
                                  }
                            });
                            return _section_model_;
                      };

                  // if a collection has been provided in the signature, let's walk it.
                  // Otherwise, let's walk the local and global ones until a match is found.
                  if ( ! _.isEmpty( collection ) ) {
                        _walk_( id, collection );
                  } else {
                        _.each( {
                              local : self.localSectionsSettingId(),
                              global : self.getGlobalSectionsSettingId()
                        }, function( collectionSettingId, localOrGlobal ) {
                              if ( 'no_match' === _section_model_ ) {
                                    _walk_( id, collection, collectionSettingId, localOrGlobal );
                              }
                        });
                  }

                  return _section_model_;
            },


            // used in react to preview or update api settings
            // @params is an object {
            //
            // }
            isGlobalLocation : function( params ) {
                  var self = this, is_global_location = false;
                  params = params || {};
                  if ( _.has( params, 'is_global_location' ) ) {
                        is_global_location = params.is_global_location;
                  } else if ( _.has( params, 'scope' ) ) {
                        is_global_location = 'global' === params.scope;
                  } else if ( !_.isEmpty( params.location ) ) {
                        is_global_location = self.isChildOfAGlobalLocation( params.location );
                  } else if ( !_.isEmpty( params.in_sektion ) ) {
                        is_global_location = self.isChildOfAGlobalLocation( params.in_sektion );
                  } else if ( !_.isEmpty( params.id ) ) {
                        is_global_location = self.isChildOfAGlobalLocation( params.id );
                  }
                  return is_global_location;
            },

            // @params = { id : '', level : '' }
            // Recursively walk the level tree until a match is found
            // @return the level model object
            isChildOfAGlobalLocation : function( id ) {
                  var self = this,
                      walkCollection = function( id, collection ) {
                            var _data_ = 'no_match';
                            // do we have a collection ?
                            // if not, let's use the root global one
                            if ( _.isUndefined( collection ) ) {
                                  var currentSettingValue = api( self.getGlobalSectionsSettingId() )();
                                  var sektionSettingValue = _.isObject( currentSettingValue ) ? $.extend( true, {}, currentSettingValue ) : self.getDefaultSektionSettingValue( 'global' );
                                  collection = _.isArray( sektionSettingValue.collection ) ? sektionSettingValue.collection : [];
                            }
                            _.each( collection, function( levelData ) {
                                  // did we found a match recursively ?
                                  if ( 'no_match' != _data_ )
                                    return;
                                  if ( id === levelData.id ) {
                                        _data_ = levelData;
                                  } else {
                                        if ( _.isArray( levelData.collection ) ) {
                                              _data_ = walkCollection( id, levelData.collection );
                                        }
                                  }
                            });
                            return _data_;
                      };
                  return walkCollection( id ) !== 'no_match';
            },


            getLevelPositionInCollection : function( id, collection ) {
                  var self = this, _position_ = 'no_match',
                  // @param id mandatory
                  // @param collection mandatory
                  // @param collectionSettingId optional
                  // @param localOrGlobal optional
                  _walk_ = function( id, collection, collectionSettingId, localOrGlobal ) {
                        // do we have a collection ?
                        // if not, let's use the root one
                        if ( _.isUndefined( collection ) ) {
                              var currentSektionSettingValue = api( collectionSettingId )();
                              var sektionSettingValue = _.isObject( currentSektionSettingValue ) ? $.extend( true, {}, currentSektionSettingValue ) : $.extend( true, {}, self.getDefaultSektionSettingValue( localOrGlobal ) );
                              collection = _.isArray( sektionSettingValue.collection ) ? sektionSettingValue.collection : [];
                        }
                        _.each( collection, function( levelData, _key_ ) {
                              // did we find a match recursively ?
                              if ( 'no_match' != _position_ )
                                return;
                              if ( id === levelData.id ) {
                                    _position_ = _key_;
                              } else {
                                    if ( _.isArray( levelData.collection ) ) {
                                          _walk_( id, levelData.collection, collectionSettingId, localOrGlobal );
                                    }
                              }
                        });
                  };

                  // if a collection has been provided in the signature, let's walk it.
                  // Otherwise, let's walk the local and global ones until a match is found.
                  if ( ! _.isEmpty( collection ) ) {
                        _walk_( id, collection );
                  } else {
                        _.each( {
                              local : self.localSectionsSettingId(),
                              global : self.getGlobalSectionsSettingId()
                        }, function( collectionSettingId, localOrGlobal ) {
                              if ( 'no_match' === _position_ ) {
                                    _walk_( id, collectionSettingId, localOrGlobal, collection );
                              }
                        });
                  }
                  return _position_;
            },


            // @params = { property : 'options', id :  }
            // @return mixed type
            getLevelProperty : function( params ) {
                  params = _.extend( {
                        id : '',
                        property : ''
                  }, params );
                  if ( _.isEmpty( params.id ) ) {
                        api.errare( 'getLevelProperty => invalid id provided' );
                        return;
                  }
                  var self = this,
                      modelCandidate = self.getLevelModel( params.id );

                  if ( 'no_match' == modelCandidate ) {
                        api.errare( 'getLevelProperty => no level model found for id : ' + params.id );
                        return;
                  }
                  if ( ! _.isObject( modelCandidate ) ) {
                        api.errare( 'getLevelProperty => invalid model for id : ' + params.id, modelCandidate );
                        return;
                  }
                  return modelCandidate[ params.property ];
            },

            // @return a detached clone of a given level model, with new unique ids
            cloneLevel : function( levelId ) {
                  var self = this;
                  var levelModelCandidate = self.getLevelModel( levelId );
                  if ( 'no_match' == levelModelCandidate ) {
                        throw new Error( 'cloneLevel => no match for level id : ' + levelId );
                  }
                  var deepClonedLevel = $.extend( true, {}, levelModelCandidate );
                  // recursive
                  var newIdWalker = function( level_model ) {
                        if ( _.isEmpty( level_model.id ) ) {
                            throw new Error( 'cloneLevel => missing level id');
                        }
                        // No collection, we've reach the end of a branch
                        level_model.id = sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid();
                        if ( ! _.isEmpty( level_model.collection ) ) {
                              if ( ! _.isArray( level_model.collection ) ) {
                                    throw new Error( 'cloneLevel => the collection must be an array for level id : ' + level_model.id );
                              }
                              _.each( level_model.collection, function( levelData ) {
                                    levelData.id = sektionsLocalizedData.optPrefixForSektionsNotSaved + self.guid();
                                    newIdWalker( levelData );
                              });
                        }
                        return level_model;
                  };
                  // recursively walk the provided level sub-tree until all collection ids are updated
                  return newIdWalker( deepClonedLevel );
            },

            // Extract the default model values from the server localized registered module
            // Invoked when registrating a module in api.czrModuleMap
            // For example :
            // czr_image_module : {
            //       mthds : ImageModuleConstructor,
            //       crud : false,
            //       name : 'Image',
            //       has_mod_opt : false,
            //       ready_on_section_expanded : true,
            //       defaultItemModel : _.extend(
            //             { id : '', title : '' },
            //             api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_image_module' )
            //       )
            // },
            // @return {}
            getDefaultItemModelFromRegisteredModuleData : function( moduleType ) {
                  if ( ! this.isModuleRegistered( moduleType ) ) {
                        return {};
                  }
                  // This method should normally not be invoked for a father module type
                  if ( sektionsLocalizedData.registeredModules[moduleType].is_father ) {
                        api.errare( 'getDefaultItemModelFromRegisteredModuleData => Father modules should be treated specifically' );
                        return;
                  }
                  var data = sektionsLocalizedData.registeredModules[ moduleType ].tmpl['item-inputs'],
                      // title, id are always included in the defaultItemModel but those properties don't need to be saved in database
                      // title and id are legacy entries that can be used in multi-items modules to identify and name the item
                      defaultItemModel = {
                            id : '',
                            title : ''
                      },
                      self = this;

                  _.each( data, function( _d_, _key_ ) {
                        switch ( _key_ ) {
                              case 'tabs' :
                                    _.each( _d_ , function( _tabData_ ) {
                                          _.each( _tabData_.inputs, function( _inputData_, _id_ ) {
                                                defaultItemModel[ _id_ ] = _inputData_['default'] || '';
                                          });
                                    });
                              break;
                              default :
                                    defaultItemModel[ _key_ ] = _d_['default'] || '';
                              break;
                        }
                  });
                  return defaultItemModel;
            },

            //@return mixed
            getRegisteredModuleProperty : function( moduleType, property ) {
                  if ( ! this.isModuleRegistered( moduleType ) ) {
                        return 'not_set';
                  }
                  return sektionsLocalizedData.registeredModules[ moduleType ][ property ];
            },

            // @return boolean
            isModuleRegistered : function( moduleType ) {
                  return sektionsLocalizedData.registeredModules && ! _.isUndefined( sektionsLocalizedData.registeredModules[ moduleType ] );
            },


            // Walk the main sektion setting and populate an array of google fonts
            // This method is used when processing the 'sek-update-fonts' action to update the .fonts property
            // To be a candidate for sniffing, an input font value  should meet those criteria :
            // 1) be the value of a '{...}_css' input id
            // 2) this input must be a font modifier ( @see 'refresh_fonts' params set on parent module registration )
            // 2) the font should start with [gfont]
            // @param args { is_global_location : bool }
            // @return array
            sniffGFonts : function( args ) {
                  args = args || { is_global_location : false };
                  var self = this,
                  gfonts = [],
                  _snifff_ = function( collectionSettingId, localOrGlobal, level ) {
                        if ( _.isUndefined( level ) ) {
                              var currentSektionSettingValue = api( collectionSettingId )();
                              level = _.isObject( currentSektionSettingValue ) ? $.extend( true, {}, currentSektionSettingValue ) : $.extend( true, {}, self.getDefaultSektionSettingValue( localOrGlobal ) );
                        }
                        _.each( level, function( levelData, _key_ ) {
                              // example of input_id candidate 'font_family_css'
                              if ( _.isString( _key_ ) && '_css' === _key_.substr( _key_.length - 4 ) ) {
                                    if ( true === self.inputIsAFontFamilyModifier( _key_ ) ) {
                                          if ( levelData.indexOf('gfont') > -1 && ! _.contains( gfonts, levelData ) ) {
                                                gfonts.push( levelData );
                                          }
                                    }
                              }

                              if ( _.isArray( levelData ) || _.isObject( levelData ) ) {
                                    _snifff_( collectionSettingId, localOrGlobal, levelData );
                              }
                        });
                  };
                  if ( args.is_global_location ) {
                        _snifff_( self.getGlobalSectionsSettingId(), 'global' );
                  } else {
                        _snifff_( self.localSectionsSettingId(), 'local' );
                  }

                  return gfonts;
            },

            // return an array of all fonts currently used in local sections, global sections and global options
            sniffAllFonts : function() {
                  var self = this,
                      Allfonts = [],
                      _snifff_ = function( collectionSettingId, level ) {
                            if ( _.isUndefined( level ) ) {
                                  var currentSektionSettingValue = api( collectionSettingId )();
                                  level = _.isObject( currentSektionSettingValue ) ? $.extend( true, {}, currentSektionSettingValue ) : $.extend( true, {}, self.getDefaultSektionSettingValue( localOrGlobal ) );
                            }
                            _.each( level, function( levelData, _key_ ) {
                                  // example of input_id candidate 'font_family_css'
                                  // if ( _.isString( _key_ ) && _.isString( levelData ) && ( levelData.indexOf('[gfont]') > -1 || levelData.indexOf('[cfont]') > -1 ) && ! _.contains( Allfonts, levelData ) ) {
                                  //       Allfonts.push( levelData );
                                  // }
                                  if ( _.isString( _key_ ) && _.isString( levelData ) && ( levelData.indexOf('[gfont]') > -1 || levelData.indexOf('[cfont]') > -1 ) ) {
                                        Allfonts.push( levelData );
                                  }
                                  if ( _.isArray( levelData ) || _.isObject( levelData ) ) {
                                        _snifff_( collectionSettingId, levelData );
                                  }
                            });
                      };

                  _.each( [ self.localSectionsSettingId(), self.getGlobalSectionsSettingId(), sektionsLocalizedData.optNameForGlobalOptions ], function( setId ) {
                        _snifff_( setId );
                  });
                  return Allfonts;
            },







            //-------------------------------------------------------------------------------------------------
            // <RECURSIVE UTILITIES USING THE sektionsLocalizedData.registeredModules>
            //-------------------------------------------------------------------------------------------------
            // Invoked when updating a setting value => in normalizeAndSanitizeSingleItemInputValues(), when doing updateAPISettingAndExecutePreviewActions()
            // @return a mixed type default value
            // @param input_id string
            // @param module_type string
            // @param level array || object
            getInputDefaultValue : function( input_id, module_type, level ) {
                  var self = this;

                  // Do we have a cached default value ?
                  self.cachedDefaultInputValues = self.cachedDefaultInputValues || {};
                  self.cachedDefaultInputValues[ module_type ] = self.cachedDefaultInputValues[ module_type ] || {};
                  if ( _.has( self.cachedDefaultInputValues[ module_type ], input_id ) ) {
                        return self.cachedDefaultInputValues[ module_type ][ input_id ];
                  }
                  if ( _.isUndefined( sektionsLocalizedData.registeredModules ) ) {
                        api.errare( 'getInputDefaultValue => missing sektionsLocalizedData.registeredModules' );
                        return;
                  }
                  if ( _.isUndefined( sektionsLocalizedData.registeredModules[module_type] ) ) {
                        api.errare( 'getInputDefaultValue => missing ' + module_type + ' in sektionsLocalizedData.registeredModules' );
                        return;
                  }
                  // This method should normally not be invoked for a father module type
                  if ( sektionsLocalizedData.registeredModules[module_type].is_father ) {
                        api.errare( 'getInputDefaultValue => Father modules should be treated specifically' );
                        return;
                  }
                  if ( _.isUndefined( level ) ) {
                        level = sektionsLocalizedData.registeredModules[ module_type ].tmpl;
                  }
                  var _defaultVal_ = 'no_default_value_specified';
                  _.each( level, function( levelData, _key_ ) {
                        // we found a match skip next levels
                        if ( 'no_default_value_specified' !== _defaultVal_ )
                          return;
                        if ( input_id === _key_ && ! _.isUndefined( levelData.default ) ) {
                              _defaultVal_ = levelData.default;
                        }
                        // if we have still no match, and the data are sniffable, let's go ahead recursively
                        if ( 'no_default_value_specified' === _defaultVal_ && ( _.isArray( levelData ) || _.isObject( levelData ) ) ) {
                              _defaultVal_ = self.getInputDefaultValue( input_id, module_type, levelData );
                        }
                        if ( 'no_default_value_specified' !== _defaultVal_ ) {
                            // cache it
                            self.cachedDefaultInputValues[ module_type ][ input_id ] = _defaultVal_;
                        }
                  });
                  return _defaultVal_;
            },



            // @return input_type string
            // @param input_id string
            // @param module_type string
            // @param level array || object
            getInputType : function( input_id, module_type, level ) {
                  var self = this;

                  // Do we have a cached default value ?
                  self.cachedInputTypes = self.cachedInputTypes || {};
                  self.cachedInputTypes[ module_type ] = self.cachedInputTypes[ module_type ] || {};
                  if ( _.has( self.cachedInputTypes[ module_type ], input_id ) ) {
                        return self.cachedInputTypes[ module_type ][ input_id ];
                  }
                  if ( _.isUndefined( sektionsLocalizedData.registeredModules ) ) {
                        api.errare( 'getInputType => missing sektionsLocalizedData.registeredModules' );
                        return;
                  }
                  if ( _.isUndefined( sektionsLocalizedData.registeredModules[module_type] ) ) {
                        api.errare( 'getInputType => missing ' + module_type + ' in sektionsLocalizedData.registeredModules' );
                        return;
                  }
                  if ( sektionsLocalizedData.registeredModules[module_type].is_father ) {
                        api.errare( 'getInputType => Father modules should be treated specifically' );
                        return;
                  }
                  if ( _.isUndefined( level ) ) {
                        level = sektionsLocalizedData.registeredModules[ module_type ].tmpl;
                  }
                  var _inputType_ = 'no_input_type_specified';
                  _.each( level, function( levelData, _key_ ) {
                        // we found a match skip next levels
                        if ( 'no_input_type_specified' !== _inputType_ )
                          return;
                        if ( input_id === _key_ && ! _.isUndefined( levelData.input_type ) ) {
                              _inputType_ = levelData.input_type;
                        }
                        // if we have still no match, and the data are sniffable, let's go ahead recursively
                        if ( 'no_input_type_specified' === _inputType_ && ( _.isArray( levelData ) || _.isObject( levelData ) ) ) {
                              _inputType_ = self.getInputType( input_id, module_type, levelData );
                        }
                        if ( 'no_input_type_specified' !== _inputType_ ) {
                              // cache it
                              self.cachedInputTypes[ module_type ][ input_id ] = _inputType_;
                        }
                  });
                  return _inputType_;
            },


            // Invoked when :
            // 1) updating a setting value, in ::updateAPISettingAndExecutePreviewActions()
            // 2) we need to get a registration param like the default value for example, @see spacing input
            // @return object of registration params
            // @param input_id string
            // @param module_type string
            // @param level array || object
            getInputRegistrationParams : function( input_id, module_type, level ) {
                  var self = this;

                  // Do we have a cached default value ?
                  self.cachedInputRegistrationParams = self.cachedInputRegistrationParams || {};
                  self.cachedInputRegistrationParams[ module_type ] = self.cachedInputRegistrationParams[ module_type ] || {};
                  if ( _.has( self.cachedInputRegistrationParams[ module_type ], input_id ) ) {
                        return self.cachedInputRegistrationParams[ module_type ][ input_id ];
                  }
                  if ( _.isUndefined( sektionsLocalizedData.registeredModules ) ) {
                        api.errare( 'getInputRegistrationParams => missing sektionsLocalizedData.registeredModules' );
                        return;
                  }
                  if ( _.isUndefined( sektionsLocalizedData.registeredModules[module_type] ) ) {
                        api.errare( 'getInputRegistrationParams => missing ' + module_type + ' in sektionsLocalizedData.registeredModules' );
                        return;
                  }
                  // This method should normally not be invoked for a father module type
                  if ( sektionsLocalizedData.registeredModules[module_type].is_father ) {
                        api.errare( 'getInputRegistrationParams => Father modules should be treated specifically' );
                        return;
                  }
                  if ( _.isUndefined( level ) ) {
                        level = sektionsLocalizedData.registeredModules[ module_type ].tmpl;
                  }
                  var _params_ = {};
                  _.each( level, function( levelData, _key_ ) {
                        // we found a match skip next levels
                        if ( ! _.isEmpty( _params_ ) )
                          return;
                        if ( input_id === _key_ && ! _.isUndefined( levelData.input_type ) ) {
                              _params_ = levelData;
                        }
                        // if we have still no match, and the data are sniffable, let's go ahead recursively
                        if ( _.isEmpty( _params_ ) && ( _.isArray( levelData ) || _.isObject( levelData ) ) ) {
                              _params_ = self.getInputRegistrationParams( input_id, module_type, levelData );
                        }
                        if ( ! _.isEmpty( _params_ ) ) {
                              // cache it
                              self.cachedInputRegistrationParams[ module_type ][ input_id ] = _params_;
                        }
                  });
                  return _params_;
            },


            // @return bool
            // @param input_id string
            // @param module_type string
            // @param level array || object
            inputIsAFontFamilyModifier : function( input_id, level ) {
                  var self = this;

                  // Do we have a cached default value ?
                  self.cachedFontFamilyModifier = self.cachedFontFamilyModifier || {};
                  if ( _.has( self.cachedFontFamilyModifier, input_id ) ) {
                        return self.cachedFontFamilyModifier[ input_id ];
                  }
                  if ( _.isUndefined( sektionsLocalizedData.registeredModules ) ) {
                        api.errare( 'inputIsAFontFamilyModifier => missing sektionsLocalizedData.registeredModules' );
                        return;
                  }
                  if ( _.isUndefined( level ) ) {
                        level = sektionsLocalizedData.registeredModules;
                  }
                  var _bool_ = 'not_set';
                  _.each( level, function( levelData, _key_ ) {
                        // we found a match skip next levels
                        if ( 'not_set' !== _bool_ )
                          return;
                        if ( input_id === _key_ && ! _.isUndefined( levelData.input_type ) ) {
                              _bool_ = _.isUndefined( levelData.refresh_fonts ) ? false : levelData.refresh_fonts;
                        }
                        // if we have still no match, and the data are sniffable, let's go ahead recursively
                        if ( 'not_set' === _bool_ && ( _.isArray( levelData ) || _.isObject( levelData ) ) ) {
                              _bool_ = self.inputIsAFontFamilyModifier( input_id, levelData );
                        }
                        if ( 'not_set' !== _bool_ ) {
                              // cache it
                              self.cachedFontFamilyModifier[ input_id ] = _bool_;
                        }
                  });
                  return _bool_;
            },
            //-------------------------------------------------------------------------------------------------
            // </RECURSIVE UTILITIES USING THE sektionsLocalizedData.registeredModules>
            //-------------------------------------------------------------------------------------------------















            // @return the item(s) ( array of items if multi-item module ) that we should use when adding the module to the main setting
            getModuleStartingValue : function( module_type ) {
                  if ( ! sektionsLocalizedData.registeredModules ) {
                        api.errare( 'getModuleStartingValue => missing sektionsLocalizedData.registeredModules' );
                        return 'no_starting_value';
                  }
                  if ( _.isUndefined( sektionsLocalizedData.registeredModules[ module_type ] ) ) {
                        api.errare( 'getModuleStartingValue => the module type ' + module_type + ' is not registered' );
                        return 'no_starting_value';
                  }
                  var starting_value = sektionsLocalizedData.registeredModules[ module_type ].starting_value;
                  return _.isEmpty( starting_value ) ? 'no_starting_value' : starting_value;
            },



            /*
            * Following two functions taken from jQuery.tabbable 1.0
            * see https://github.com/marklagendijk/jquery.tabbable/blob/master/jquery.tabbable.js
            *
            * Copyright 2013, Mark Lagendijk
            * Released under the MIT license
            */
            selectNextTabbableOrFocusable : function( selector ) {
                  var selectables = $( selector );
                  var current = $( ':focus' );
                  var nextIndex = 0;
                  if( current.length === 1 ) {
                        var currentIndex = selectables.index( current );
                        if( currentIndex + 1 < selectables.length ) {
                              nextIndex = currentIndex + 1;
                        }
                  }

                  selectables.eq( nextIndex ).focus();
            },

            selectPrevTabbableOrFocusable : function( selector ) {
                  var selectables = $( selector );
                  var current = $( ':focus' );
                  var prevIndex = selectables.length - 1;
                  if( current.length === 1 ) {
                        var currentIndex = selectables.index( current );
                        if( currentIndex > 0 ) {
                              prevIndex = currentIndex - 1;
                        }
                  }

                  selectables.eq( prevIndex ).focus();
            },




            //-------------------------------------------------------------------------------------------------
            // GENERIC WAY TO SETUP SELECT INPUTS
            //-------------------------------------------------------------------------------------------------
            // used in the module input constructors
            // "this" is the input
            setupSelectInput : function( selectOptions ) {
                  var input  = this,
                      item   = input.input_parent,
                      module = input.module,
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type );
                  // use the provided selectOptions if any
                  selectOptions = _.isEmpty( selectOptions ) ? inputRegistrationParams.choices : selectOptions;

                  // allow selectOptions to be filtrable remotely when the options are not passed on registration for example
                  // @see widget are module in initialize() for example
                  var filtrable = { params : selectOptions };
                  input.module.trigger( 'nimble-set-select-input-options', filtrable );
                  selectOptions = filtrable.params;

                  if ( _.isEmpty( selectOptions ) || ! _.isObject( selectOptions ) ) {
                        api.errare( 'api.czr_sektions.setupSelectInput => missing select options for input id => ' + input.id + ' in module ' + input.module.module_type );
                        return;
                  } else {
                        switch( input.type ) {
                              case 'simpleselect' :
                                    //generates the options
                                    _.each( selectOptions , function( title, value ) {
                                          var _attributes = {
                                                    value : value,
                                                    html: title
                                              };
                                          if ( value == input() ) {
                                                $.extend( _attributes, { selected : "selected" } );
                                          } else if ( 'px' === value ) {
                                                $.extend( _attributes, { selected : "selected" } );
                                          }
                                          $( 'select[data-czrtype]', input.container ).append( $('<option>', _attributes) );
                                    });
                                    $( 'select[data-czrtype]', input.container ).selecter();
                              break;
                              case 'multiselect' :
                                    // when select is multiple, the value is an array
                                    var input_value = input();
                                    input_value = _.isString( input_value ) ? [ input_value ] : input_value;
                                    input_value = !_.isArray( input_value ) ? [] : input_value;

                                    //generates the options
                                    _.each( selectOptions , function( title, value ) {
                                          var _attributes = {
                                                    value : value,
                                                    html: title
                                              };
                                          if ( _.contains( input_value, value ) ) {
                                                $.extend( _attributes, { selected : "selected" } );
                                          }
                                          $( 'select[data-czrtype]', input.container ).append( $('<option>', _attributes) );
                                    });
                                    // see how the tmpl is rendered server side in PHP with ::ac_set_input_tmpl_content()
                                    $( 'select[data-czrtype]', input.container ).czrSelect2({
                                          closeOnSelect: true,
                                          templateSelection: function czrEscapeMarkup(obj) {
                                                //trim dashes
                                                return obj.text.replace(/\u2013|\u2014/g, "");
                                          }
                                    });

                                    //handle case when all choices become unselected
                                    $( 'select[data-czrtype]', input.container ).on('change', function(){
                                          if ( 0 === $(this).find("option:selected").length ) {
                                                input([]);
                                          }
                                    });
                              break;
                              default :
                                    api.errare( '::setupSelectInput => invalid input type => ' + input.type );
                              break;
                        }
                  }
            },


            //-------------------------------------------------------------------------------------------------
            // GENERIC WAY TO SETUP FONT SIZE AND LINE HEIGHT INPUTS
            // DEPRECATED
            //-------------------------------------------------------------------------------------------------
            // "this" is the input
            setupFontSizeAndLineHeightInputs : function( obj ) {
                  var input      = this,
                      $wrapper = $('.sek-font-size-line-height-wrapper', input.container ),
                      initial_unit = $wrapper.find('input[data-czrtype]').data('sek-unit'),
                      validateUnit = function( unit ) {
                            if ( ! _.contains( ['px', 'em', '%'], unit ) ) {
                                  api.errare( 'error : invalid unit for input ' + input.id, unit );
                                  unit = 'px';
                            }
                            return unit;
                      };
                  // initialize the unit with the value provided in the dom
                  input.css_unit = new api.Value( _.isEmpty( initial_unit ) ? 'px' : validateUnit( initial_unit ) );
                  // React to a unit change
                  input.css_unit.bind( function( to ) {
                        to = _.isEmpty( to ) ? 'px' : to;
                        $wrapper.find( 'input[type="number"]').trigger('change');
                  });

                  // instantiate stepper and schedule change reactions
                  $wrapper.find( 'input[type="number"]').on('input change', function( evt ) {
                        input( $(this).val() + validateUnit( input.css_unit() ) );
                  }).stepper();


                  // Schedule unit changes on button click
                  $wrapper.on( 'click', '[data-sek-unit]', function(evt) {
                        evt.preventDefault();
                        // handle the is-selected css class toggling
                        $wrapper.find('[data-sek-unit]').removeClass('is-selected').attr( 'aria-pressed', false );
                        $(this).addClass('is-selected').attr( 'aria-pressed', true );
                        // update the initial unit ( not mandatory)
                        $wrapper.find('input[data-czrtype]').data('sek-unit', $(this).data('sek-unit') );
                        // set the current unit Value
                        input.css_unit( $(this).data('sek-unit') );
                  });

                  // add is-selected button on init to the relevant unit button
                  $wrapper.find( '.sek-ui-button[data-sek-unit="'+ initial_unit +'"]').addClass('is-selected').attr( 'aria-pressed', true );
            },



            //-------------------------------------------------------------------------------------------------
            // PREPARE INPUT REGISTERED WITH has_device_switcher set to true
            //-------------------------------------------------------------------------------------------------
            // "this" is the input
            maybeSetupDeviceSwitcherForInput : function() {
                  var input = this;
                  // render the device switcher before the input title
                  var deviceSwitcherHtml = [
                        '<span class="sek-input-device-switcher">',
                          '<i data-sek-device="desktop" class="sek-switcher preview-desktop active" title="'+ sektionsLocalizedData.i18n['Settings on desktops'] +'"></i>',
                          '<i data-sek-device="tablet" class="sek-switcher preview-tablet" title="'+ sektionsLocalizedData.i18n['Settings on tablets'] +'"></i>',
                          '<i data-sek-device="mobile" class="sek-switcher preview-mobile" title="'+ sektionsLocalizedData.i18n['Settings on mobiles'] +'"></i>',
                        '</span>'
                  ].join(' ');

                  input.container.find('.customize-control-title').prepend( deviceSwitcherHtml );
                  input.previewedDevice = new api.Value( api.previewedDevice() );


                  syncWithPreviewedDevice = function( evt ) {
                        evt.stopPropagation();
                        input.container.find( '[data-sek-device]' ).removeClass('active');
                        $(this).addClass('active');
                        var device = 'desktop';
                        try { device = $(this).data('sek-device'); } catch( er ) {
                              api.errare( 'maybeSetupDeviceSwitcherForInput => error when binding sek-switcher', er );
                        }
                        try { api.previewedDevice( device ); } catch( er ) {
                              api.errare( 'maybeSetupDeviceSwitcherForInput => error when setting the previewed device', er );
                        }
                        input.previewedDevice( device );
                  };
                  // react on device click
                  input.container.on( 'click', '[data-sek-device]', syncWithPreviewedDevice );

                  // initialize with the currently previewed device
                  var $currentDeviceIcon = input.container.find('[data-sek-device="' + api.previewedDevice() + '"]');
                  if ( $currentDeviceIcon.length > 0 ) {
                        $currentDeviceIcon.trigger('click');
                  }
            },



            //-------------------------------------------------------------------------------------------------
            // GENERIC WAY TO SETUP ACCORDION BEHAVIOUR OF MODULES IN SECTIONS
            //-------------------------------------------------------------------------------------------------
            // "this" is the section
            // in the content picker section, control's container have the attribute "data-sek-accordion" to selectively enable the accordion
            // @see ::generateUIforDraggableContent()
            // @params { expand_first_control : boolean }
            scheduleModuleAccordion : function( params ) {
                  params = params || { expand_first_control : true };
                  var _section_ = this;
                  // Attach event on click
                  $( _section_.container ).on( 'click', '.customize-control label > .customize-control-title', function( evt ) {
                        //evt.preventDefault();
                        evt.stopPropagation();
                        var $control = $(this).closest( '.customize-control');

                        if ( "no" === $control.attr( 'data-sek-accordion' ))
                          return;

                        _section_.container.find('.customize-control').not( $control ).each( function() {
                              if ( $(this).attr( 'data-sek-accordion' ) )
                                return;
                              $(this).attr('data-sek-expanded', "false" );
                              $(this).find('.czr-items-wrapper').stop( true, true ).slideUp( 0 );
                        });
                        $control.find('.czr-items-wrapper').stop( true, true ).slideToggle({
                              duration : 0,
                              start : function() {
                                    $control.attr('data-sek-expanded', "false" == $control.attr('data-sek-expanded') ? "true" : "false" );
                                    // this event 'sek-accordion-expanded', is used to defer the instantiation of the code editor
                                    // @see api.czrInputMap['code_editor']
                                    // @see https://github.com/presscustomizr/nimble-builder/issues/176
                                    $control.trigger( "true" == $control.attr('data-sek-expanded') ? 'sek-accordion-expanded' : 'sek-accordion-collapsed' );
                              }
                        });
                  });

                  // Expand the first module if requested
                  if ( params.expand_first_control ) {
                        var firstControl = _.first( _section_.controls() );
                        if ( _.isObject( firstControl ) && ! _.isEmpty( firstControl.id ) ) {
                              api.control( firstControl.id, function( _ctrl_ ) {
                                    _ctrl_.container.trigger( 'sek-accordion-expanded' );
                                    _section_.container.find('.customize-control').first().find('label > .customize-control-title').trigger('click');
                              });
                        }
                  }
            },



            //-------------------------------------------------------------------------------------------------
            // HELPERS USED WHEN UPLOADING IMAGES FROM PRESET SECTIONS
            //-------------------------------------------------------------------------------------------------
            isPromise : function (fn) {
                  return fn && typeof fn.then === 'function' && String( $.Deferred().then ) === String( fn.then );
            },

            // @param deferreds = { '__img_url__/assets/img/tests/1.jpg' : 'dfd1', '__img_url__/assets/img/tests/2.jpg' : dfd2, ..., '__img_url__/assets/img/tests/n.jpg' : dfdn }
            whenAllPromisesInParallel : function ( deferreds ) {
                var self = this,
                    mainDfd = $.Deferred(),
                    args = [],
                    _keys_ = _.keys( deferreds );

                _.each( deferreds, function( mayBeDfd, _k_ ) {
                      args.push( $.Deferred( function( _dfd_ ) {
                            var dfdCandidate = self.isPromise( mayBeDfd ) ? mayBeDfd : $.Deferred();
                            dfdCandidate
                                  .done( _dfd_.resolve )
                                  .fail( function (err) { _dfd_.reject( err ); } );
                      }) );
                });
                $.when.apply( this, args )
                      .done( function () {
                          var resObj = {},
                              resArgs = Array.prototype.slice.call( arguments );

                          _.each( resArgs, function( v, i ) {
                                resObj[ _keys_[i] ] = v;
                          });
                          mainDfd.resolve( resObj );
                      })
                      .fail( mainDfd.reject );

                return mainDfd;
            },

            // Run the deferred in sequence, only one asynchronous method at a time
            // Was an experiment when implementing the img assets upload for preset sections
            // Abandonned for whenAllPromisesInParallel
            whenAllPromisesInSerie : function ( deferreds, ind, promiseMessages, mainDfd ) {
                ind = ind || 0;
                promiseMessages = promiseMessages || {};
                mainDfd = mainDfd || $.Deferred();
                var self = this;
                if ( _.isArray( deferreds ) ) {
                      var mayBeDfd = deferreds[ind],
                          dfdCandidate = self.isPromise( mayBeDfd ) ? mayBeDfd : $.Deferred( function( _d_ ) { _d_.resolve(); } );

                      dfdCandidate.always( function( msg ) {
                            promiseMessages[ ind ] = msg;
                            if ( ( ind + 1 ) == deferreds.length ) {
                                  mainDfd.resolve( promiseMessages );
                            } else {
                                  if ( ind + 1 < deferreds.length ) {
                                      self.whenAllPromisesInSerie( deferreds, ind + 1, promiseMessages, mainDfd );
                                  }
                            }
                      });
                }//if
                return mainDfd;
            },


            // @param attachment_url = string : '/assets/img/41883.jpg'
            // @return a promise
            importAttachment : function( attachment_url ) {
                  // @see php wp_ajax_sek_import_attachment
                  return wp.ajax.post( 'sek_import_attachment', {
                        img_url : attachment_url,
                        nonce: api.settings.nonce.save//<= do we need to set a specific nonce to fetch the attachment
                  })
                  .fail( function( _er_ ) {
                        api.errare( 'sek_import_attachment ajax action failed for image ' +  attachment_url, _er_ );
                  });
                  // .done( function( data) {
                  //       api.infoLog('relpath and DATA ' + relpath , data );
                  // });
            },






            // recursive helper
            // used when saving a section
            cleanIds : function( levelData ) {
                  levelData.id = "";
                  var self = this;
                  _.each( levelData.collection, function( levelData ) {
                        levelData.id = "";
                        if ( _.isArray( levelData.collection ) ) {
                              self.cleanIds( levelData );
                        }
                  });
                  return levelData;
            },

            // @return { collection[] ... }
            getDefaultSektionSettingValue : function( localOrGlobal ) {
                  if ( _.isUndefined( localOrGlobal ) || !_.contains( [ 'local', 'global' ], localOrGlobal ) ) {
                        api.errare( 'getDefaultSektionSettingValue => the skope should be set to local or global');
                  }
                  return 'global' === localOrGlobal ? sektionsLocalizedData.defaultGlobalSektionSettingValue : sektionsLocalizedData.defaultLocalSektionSettingValue;
            },

            // @return void()
            // input controller instance == this
            scheduleVisibilityOfInputId : function( controlledInputId, visibilityCallBack ) {
                  var item = this.input_parent;
                  if ( !_.isFunction(visibilityCallBack) || _.isEmpty(controlledInputId) ) {
                        throw new Error('::scheduleVisibilityOfInputId => error when firing for input id : ' + this.id );
                  }
                  //Fire on init
                  item.czr_Input( controlledInputId ).visible( visibilityCallBack() );
                  //React on change
                  this.bind( function( to ) {
                        item.czr_Input( controlledInputId ).visible( visibilityCallBack() );
                  });
            }
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
/**
 * @https://github.com/StackHive/DragDropInterface
 * @https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API
 * @https://html.spec.whatwg.org/multipage/dnd.html#dnd
 * @https://caniuse.com/#feat=dragndrop
 */
// EVENTS

// drag  => handler : ondrag  Fired when an element or text selection is being dragged.
// dragend => handler : ondragend Fired when a drag operation is being ended (for example, by releasing a mouse button or hitting the escape key). (See Finishing a Drag.)
// dragenter => handler : ondragenter Fired when a dragged element or text selection enters a valid drop target. (See Specifying Drop Targets.)
// dragexit  => handler : ondragexit  Fired when an element is no longer the drag operation's immediate selection target.
// dragleave => handler : ondragleave Fired when a dragged element or text selection leaves a valid drop target.
// dragover  => handler : ondragover  Fired when an element or text selection is being dragged over a valid drop target (every few hundred milliseconds).
// dragstart => handler : ondragstart Fired when the user starts dragging an element or text selection. (See Starting a Drag Operation.)
// drop  => handler : ondrop  Fired when an element or text selection is dropped on a valid drop target. (See Performing a Drop.)

// Drop targets can be rendered statically when the preview is rendered or dynamically on dragstart ( sent to preview with 'sek-drag-start')
// Typically, an empty column will be populated with a zek-drop-zone element statically in the preview.
// The other drop zones are rendered dynamically in ::schedulePanelMsgReactions case 'sek-drag-start'
//
// droppable targets are defined server side in sektionsLocalizedData.dropSelectors :
// '.sek-drop-zone' <= to pass the ::dnd_canDrop() test, a droppable target should have this css class
// 'body' <= body will not be eligible for drop, but setting the body as drop zone allows us to fire dragenter / dragover actions, like toggling the "approaching" or "close" css class to real drop zone
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            //-------------------------------------------------------------------------------------------------
            //-- SETUP DnD
            //-------------------------------------------------------------------------------------------------
            //Fired in ::initialize()
            // INSTANTIATE Dnd ZONES IF SUPPORTED BY THE BROWSER
            // + SCHEDULE DROP ZONES RE-INSTANTIATION ON PREVIEW REFRESH
            // + SCHEDULE API REACTION TO *drop event
            // setup $.sekDrop for $( api.previewer.targetWindow().document ).find( '.sektion-wrapper')
            setupDnd : function() {
                  var self = this;
                  // emitted by the module_picker or the section_picker module
                  // @params { type : 'section' || 'module', input_container : input.container }
                  self.bind( 'sek-refresh-dragzones', function( params ) {
                        // Detecting HTML5 Drag And Drop support in javascript
                        // https://stackoverflow.com/questions/2856262/detecting-html5-drag-and-drop-support-in-javascript#2856275
                        if (  true !== 'draggable' in document.createElement('span') ) {
                              api.panel( sektionsLocalizedData.sektionsPanelId, function( __main_panel__ ) {
                                    api.notifications.add( new api.Notification( 'drag-drop-support', {
                                          type: 'error',
                                          message:  sektionsLocalizedData.i18n['This browser does not support drag and drop. You might need to update your browser or use another one.'],
                                          dismissible: true
                                    } ) );

                                    // Removed if not dismissed after 5 seconds
                                    _.delay( function() {
                                          api.notifications.remove( 'drag-drop-support' );
                                    }, 10000 );
                              });

                        }

                        self.setupNimbleDragZones( params.input_container );//<= module or section picker
                  });

                  // on previewer refresh
                  api.previewer.bind( 'ready', function() {
                        try { self.setupNimbleDropZones();//<= module or section picker
                        } catch( er ) {
                              api.errare( '::setupDnd => error on self.setupNimbleDropZones()', er );
                        }
                        // if the module_picker or the section_picker is currently a registered ui control,
                        // => re-instantiate sekDrop on the new preview frame
                        // the registered() ui levels look like :
                        // [
                        //   { what: "control", id: "__nimble___sek_draggable_sections_ui", label: "Section Picker", type: "czr_module", module_type: "sek_intro_sec_picker_module", …}
                        //   { what: "setting", id: "__nimble___sek_draggable_sections_ui", dirty: false, value: "", transport: "postMessage", … }
                        //   { what: "section", id: "__nimble___sek_draggable_sections_ui", title: "Section Picker", panel: "__sektions__", priority: 30}
                        // ]
                        if ( ! _.isUndefined( _.findWhere( self.registered(), { module_type : 'sek_intro_sec_picker_module' } ) ) ) {
                              self.rootPanelFocus();
                        } else if ( ! _.isUndefined( _.findWhere( self.registered(), { module_type : 'sek_module_picker_module' } ) ) ) {
                              self.rootPanelFocus();
                        }
                  });

                  // React to the *-droped event
                  self.reactToDrop();
            },

            //-------------------------------------------------------------------------------------------------
            //--DRAG ZONES SETUP
            //-------------------------------------------------------------------------------------------------
            // fired in ::initialize, on 'sek-refresh-nimbleDragDropZones
            // 'sek-refresh-nimbleDragDropZones' is emitted by the section and the module picker modules with param { type : 'section_picker' || 'module_picker'}
            setupNimbleDragZones : function( $draggableWrapper ) {
                  var self = this;
                  //api.infoLog('instantiate', type );
                  // $(this) is the dragged element
                  var _onStart = function( evt ) {
                        // Reset the preview target
                        // implemented for double-click insertion https://github.com/presscustomizr/nimble-builder/issues/317
                        self.lastClickedTargetInPreview({});

                        evt.originalEvent.dataTransfer.setData( "sek-content-type", $(this).data('sek-content-type') );
                        evt.originalEvent.dataTransfer.setData( "sek-content-id", $(this).data('sek-content-id') );
                        evt.originalEvent.dataTransfer.setData( "sek-section-type", $(this).data('sek-section-type') );
                        evt.originalEvent.dataTransfer.setData( "sek-is-user-section", $(this).data('sek-is-user-section') );

                        // in addition to the dataTransfer storage, store the properties of the dragged object in a static property
                        // => we will need it for example to access the object property when checking if "can drop"
                        self.dndData = {
                              content_type : evt.originalEvent.dataTransfer.getData( "sek-content-type" ),
                              content_id : evt.originalEvent.dataTransfer.getData( "sek-content-id" ),
                              section_type : evt.originalEvent.dataTransfer.getData( "sek-section-type" ),
                              // Saved sections
                              is_user_section : "true" === evt.originalEvent.dataTransfer.getData( "sek-is-user-section" )
                        };

                        // evt.originalEvent.dataTransfer.effectAllowed = "move";
                        // evt.originalEvent.dataTransfer.dropEffect = "move";
                        // Notify if not supported : https://caniuse.com/#feat=dragndrop
                        try {
                              evt.originalEvent.dataTransfer.setData( 'browserSupport', 'browserSupport' );
                              evt.originalEvent.dataTransfer.clearData( 'browserSupport' );
                        } catch ( er ) {
                              api.panel( sektionsLocalizedData.sektionsPanelId, function( __main_panel__ ) {
                                    api.notifications.add( new api.Notification( 'drag-drop-support', {
                                          type: 'error',
                                          message:  sektionsLocalizedData.i18n['This browser does not support drag and drop. You might need to update your browser or use another one.'],
                                          dismissible: true
                                    } ) );

                                    // Removed if not dismissed after 5 seconds
                                    _.delay( function() {
                                          api.notifications.remove( 'drag-drop-support' );
                                    }, 10000 );
                              });
                        }
                        $(this).addClass('sek-dragged');
                        $('body').addClass('sek-dragging');
                        api.previewer.send( 'sek-drag-start', { type : self.dndData.content_type } );//fires the rendering of the dropzones
                  };
                  // $(this) is the dragged element
                  var _onEnd = function( evt ) {
                        $('body').removeClass('sek-dragging');
                        $(this).removeClass('sek-dragged');
                        api.previewer.send( 'sek-drag-stop' );
                  };
                  // $(this) is the double clicked element
                  var _onDoubleClick = function( evt ) {
                        var _targetCandidate = self.lastClickedTargetInPreview();// { id : "__nimble__fb2ab3e47472" }
                        var $dropTarget;
                        if ( ! _.isEmpty( _targetCandidate ) && _targetCandidate.id ) {
                              $dropTarget = self.dnd_getDropZonesElements().find('[data-sek-id="' + _targetCandidate.id + '"]').find('.sek-module-drop-zone-for-first-module').first();
                        } else {
                              _doubleClickTargetMissingNotif();
                        }

                        if ( $dropTarget && $dropTarget.length > 0 ) {
                              // "Emulate" a drop action
                              // @see ::dnd_onDrop()
                              api.czr_sektions.trigger( 'sek-content-dropped', {
                                    drop_target_element : $dropTarget,
                                    location : $dropTarget.closest('[data-sek-level="location"]').data('sek-id'),
                                    // when inserted between modules
                                    before_module : $dropTarget.data('drop-zone-before-module-or-nested-section'),
                                    after_module : $dropTarget.data('drop-zone-after-module-or-nested-section'),

                                    // When inserted between sections
                                    before_section : $dropTarget.data('drop-zone-before-section'),
                                    after_section : $dropTarget.data('drop-zone-after-section'),

                                    content_type : $(this).data('sek-content-type'),
                                    content_id : $(this).data('sek-content-id'),

                                    section_type : $(this).data('sek-section-type'),
                                    // Saved sections
                                    is_user_section : "true" === $(this).data('sek-is-user-section')
                              });
                              // And reset the preview target
                              self.lastClickedTargetInPreview({});
                        } else {
                              _doubleClickTargetMissingNotif();
                              api.errare( 'Double click insertion => the target zone was not found');
                        }
                  };//_onDoubleClick()
                  var _doubleClickTargetMissingNotif = function() {
                        api.notifications.add( new api.Notification( 'missing-injection-target', {
                              type: 'info',
                              message: sektionsLocalizedData.i18n['You first need to click on a target ( with a + icon ) in the preview.'],
                              dismissible: true
                        } ) );
                        // Removed if not dismissed after a moment
                        _.delay( function() {
                              api.notifications.remove( 'missing-injection-target' );
                        }, 30000 );
                  };

                  // Schedule
                  $draggableWrapper.find( '[draggable="true"]' ).each( function() {
                        $(this)
                              .on( 'dragstart', function( evt ) { _onStart.call( $(this), evt ); })
                              .on( 'dragend', function( evt ) { _onEnd.call( $(this), evt ); })
                              // double click insertion
                              // implemented for https://github.com/presscustomizr/nimble-builder/issues/317
                              .dblclick( function( evt ) { _onDoubleClick.call( $(this), evt ); });
                  });
            },//setupNimbleZones()












            //-------------------------------------------------------------------------------------------------
            //--DRAG ZONES SETUP
            //-------------------------------------------------------------------------------------------------
            // Scheduled on previewer('ready') each time the previewer is refreshed
            setupNimbleDropZones : function() {
                  var self = this;
                  this.$dropZones = this.dnd_getDropZonesElements();
                  this.preDropElement = $( '<div>', {
                        class: sektionsLocalizedData.preDropElementClass,
                        html : ''//will be set dynamically
                  });
                  if ( this.$dropZones.length < 1 ) {
                        throw new Error( '::setupNimbleDropZones => invalid Dom element');
                  }

                  this.$dropZones.each( function() {
                        var $zone = $(this);
                        // Make sure we don't delegate an event twice for a given element
                        if ( true === $zone.data('zone-droppable-setup') )
                            return;

                        self.enterOverTimer = null;
                        // Delegated to allow reactions on future modules / sections
                        $zone
                              //.on( 'dragenter dragover', sektionsLocalizedData.dropSelectors,  )
                              .on( 'dragenter dragover', sektionsLocalizedData.dropSelectors, function( evt ) {
                                    //api.infoLog( self.enterOverTimer, self.dnd_canDrop( { targetEl : $(this), evt : evt } ) );
                                    if ( _.isNull( self.enterOverTimer ) ) {
                                          self.enterOverTimer = true;
                                          _.delay(function() {
                                                // If the mouse did not move, reset the time and do nothing
                                                // this will prevent a drop zone to "dance", aka expand collapse, when stoping the mouse close to it
                                                if ( self.currentMousePosition && ( ( self.currentMousePosition + '' ) == ( evt.clientY + '' + evt.clientX + '') ) ) {
                                                      self.enterOverTimer = null;
                                                      return;
                                                }
                                                self.currentMousePosition = evt.clientY + '' + evt.clientX + '';
                                                self.dnd_toggleDragApproachClassesToDropZones( evt );
                                          }, 100 );
                                    }

                                    if ( ! self.dnd_canDrop( { targetEl : $(this), evt : evt } ) )
                                      return;

                                    evt.stopPropagation();
                                    self.dnd_OnEnterOver( $(this), evt );
                              })
                              .on( 'dragleave drop', sektionsLocalizedData.dropSelectors, function( evt ) {
                                    switch( evt.type ) {
                                          case 'dragleave' :
                                                if ( ! self.dnd_isOveringDropTarget( $(this), evt  ) ) {
                                                      self.dnd_cleanOnLeaveDrop( $(this), evt );
                                                }
                                          break;
                                          case 'drop' :
                                                // Reset the this.$cachedDropZoneCandidates now
                                                this.$cachedDropZoneCandidates = null;//has been declared on enter over

                                                if ( ! self.dnd_canDrop( { targetEl : $(this), evt : evt } ) )
                                                  return;
                                                evt.preventDefault();//@see https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations#drop
                                                self.dnd_onDrop( $(this), evt );
                                                self.dnd_cleanOnLeaveDrop( $(this), evt );
                                                // this event will fire another cleaner
                                                // also sent on dragend
                                                api.previewer.send( 'sek-drag-stop' );
                                          break;
                                    }
                              })
                              .data( 'zone-droppable-setup', true );// flag the zone. Will be removed on 'destroy'

                });//this.dropZones.each()
            },//setupNimbleDropZones()



            dnd_isInTarget : function( $el, evt ) {
                  var yPos = evt.clientY,
                      xPos = evt.clientX,
                      dzoneRect = $el[0].getBoundingClientRect(),
                      isInHorizontally = xPos <= dzoneRect.right && dzoneRect.left <= xPos,
                      isInVertically = yPos >= dzoneRect.top && dzoneRect.bottom >= yPos;
                  return isInVertically && isInHorizontally;
            },

            //-------------------------------------------------------------------------------------------------
            //-- DnD Helpers
            //-------------------------------------------------------------------------------------------------
            // Fired on 'dragenter dragover'
            // toggles the "approaching" and "close" css classes when conditions are met.
            //
            // Because this function can be potentially heavy if there are a lot of drop zones, this is fired with a timer
            //
            // Note : this is fired before checking if the target is eligible for drop. This way we can calculate an approach, as soon as we start hovering the 'body' ( which is part the drop selector list )
            dnd_toggleDragApproachClassesToDropZones : function( evt ) {

                  var self = this,
                      getHypotenuse = function( a, b ) {
                            return(Math.sqrt((a * a) + (b * b)));
                      };

                  this.$dropZones = this.$dropZones || this.dnd_getDropZonesElements();
                  this.$cachedDropZoneCandidates = _.isEmpty( this.$cachedDropZoneCandidates ) ? this.$dropZones.find('.sek-drop-zone') : this.$cachedDropZoneCandidates;// Will be reset on drop

                  this.distanceTable = [];

                  this.$dropZones.find('.sek-drop-zone').each( function() {
                        var yPos = evt.clientY,
                            xPos = evt.clientX,
                            APPROACHING_DIST = 120,
                            CLOSE_DIST = 80,
                            VERY_CLOSE_DIST = 50;//60;

                        var dzoneRect = $(this)[0].getBoundingClientRect(),
                            mouseToYCenter = Math.abs( yPos - ( dzoneRect.bottom - ( dzoneRect.bottom - dzoneRect.top )/2 ) ),
                            mouseToTop = Math.abs( dzoneRect.top - yPos ),
                            mouseToXCenter = Math.abs( xPos - ( dzoneRect.right - ( dzoneRect.right - dzoneRect.left )/2 ) ),
                            mouseToRight = xPos - dzoneRect.right,
                            mouseToLeft = dzoneRect.left - xPos,
                            isVeryCloseVertically = mouseToYCenter < VERY_CLOSE_DIST,
                            isVeryCloseHorizontally =  mouseToXCenter < VERY_CLOSE_DIST,
                            isCloseVertically = mouseToYCenter < CLOSE_DIST,
                            isCloseHorizontally =  mouseToXCenter < CLOSE_DIST,
                            isApproachingVertically = mouseToYCenter < APPROACHING_DIST,
                            isApproachingHorizontally = mouseToXCenter < APPROACHING_DIST,

                            isInHorizontally = xPos <= dzoneRect.right && dzoneRect.left <= xPos,
                            isInVertically = yPos >= dzoneRect.top && dzoneRect.bottom >= yPos;

                        // var html = "isApproachingHorizontally : " + isApproachingHorizontally + ' | isCloseHorizontally : ' + isCloseHorizontally + ' | isInHorizontally : ' + isInHorizontally;
                        // html += ' | xPos : ' + xPos + ' | zoneRect.right : ' + dzoneRect.right;
                        // html += "isApproachingVertically : " + isApproachingVertically + ' | isCloseVertically : ' + isCloseVertically + ' | isInVertically : ' + isInVertically;
                        // html += ' | yPos : ' + yPos + ' | zoneRect.top : ' + dzoneRect.top;
                        // $(this).html( '<span style="font-size:10px">' + html + '</span>');

                        // var html = '';
                        // html += ' | mouseToBottom : ' + mouseToBottom + ' | mouseToTop : ' + mouseToTop;
                        // html += "isApproachingVertically : " + isApproachingVertically + ' | isCloseVertically : ' + isCloseVertically + ' | isInVertically : ' + isInVertically;
                        // $(this).html( '<span style="font-size:12px">' + html + '</span>');

                        // var html = ' | xPos : ' + xPos + ' | zoneRect.right : ' + dzoneRect.right + ' | zoneRect.left : ' + dzoneRect.left;
                        // html += "mouseToYCenter : " + mouseToYCenter + ' | mouseToXCenter : ' + mouseToXCenter;
                        // html += ' | yPos : ' + yPos + ' | zoneRect.top : ' + dzoneRect.top + ' | zoneRect.bottom : ' + dzoneRect.bottom;
                        // $(this).html( '<span style="font-size:10px">' + html + '</span>');

                        self.distanceTable.push({
                              el : $(this),
                              dist : ( isInVertically && isInHorizontally ) ? 0 : getHypotenuse( mouseToXCenter, mouseToYCenter )
                        });


                        //var html = '';

                        // if ( isInVertically && isInHorizontally ) {
                        //       $(this).removeClass( 'sek-drag-is-approaching');
                        //       $(this).removeClass( 'sek-drag-is-close' );
                        //       $(this).removeClass( 'sek-drag-is-very-close');
                        //       $(this).addClass( 'sek-drag-is-in');
                        //       //html += 'is IN';
                        // }
                        // else if ( ( isCloseVertically || isInVertically ) && ( isCloseHorizontally || isInHorizontally ) ) {
                        //       $(this).removeClass( 'sek-drag-is-approaching');
                        //             $(this).addClass( 'sek-drag-is-close' );
                        //       $(this).removeClass( 'sek-drag-is-very-close');
                        //       $(this).removeClass( 'sek-drag-is-in');
                        //       //html += 'is close';
                        // } else if ( ( isApproachingVertically || isInVertically ) && ( isApproachingHorizontally || isInHorizontally ) ) {
                        //             $(this).addClass( 'sek-drag-is-approaching');
                        //       $(this).removeClass( 'sek-drag-is-close' );
                        //       $(this).removeClass( 'sek-drag-is-very-close');
                        //       $(this).removeClass( 'sek-drag-is-in');
                        //       //html += 'is approaching';
                        //
                        $(this).removeClass( 'sek-drag-is-in');

                        if ( ( isVeryCloseVertically || isInVertically ) && ( isVeryCloseHorizontally || isInHorizontally ) ) {
                              $(this).removeClass( 'sek-drag-is-approaching');
                              $(this).removeClass( 'sek-drag-is-close' );
                              $(this).addClass( 'sek-drag-is-very-close');
                              $(this).removeClass( 'sek-drag-is-in');
                              //html += 'is very close';
                        } else {
                              $(this).removeClass( 'sek-drag-is-approaching');
                              $(this).removeClass( 'sek-drag-is-close' );
                              $(this).removeClass( 'sek-drag-is-very-close');
                              $(this).removeClass( 'sek-drag-is-in');
                        }


                        //$(this).html( '<span style="font-size:10px">' + html + '</span>');
                  });//$('.sek-drop-zones').each()


                  var _lowerDist = _.min( _.pluck( self.distanceTable, 'dist') );
                  self.$dropTargetCandidate = null;
                  _.each( self.distanceTable, function( data ) {
                        if ( _.isNull( self.$dropTargetCandidate ) && _lowerDist === data.dist ) {
                              self.$dropTargetCandidate = data.el;
                        }
                  });
                  if ( self.$dropTargetCandidate && self.$dropTargetCandidate.length > 0 && self.dnd_isInTarget( self.$dropTargetCandidate, evt ) ) {
                        self.$dropTargetCandidate.addClass('sek-drag-is-in');
                  }
                  // Reset the timer
                  self.enterOverTimer = null;
            },

            // @return string
            dnd_getPreDropElementContent : function( evt ) {
                  var $target = $( evt.currentTarget ),
                      html,
                      preDropContent;

                  switch( this.dndData.content_type ) {
                        case 'module' :
                              html = sektionsLocalizedData.i18n['Insert here'];
                              if ( $target.length > 0 ) {
                                  if ( 'between-sections' === $target.data('sek-location') || 'in-empty-location' === $target.data('sek-location') ) {
                                        html = sektionsLocalizedData.i18n['Insert in a new section'];
                                  }
                              }
                              preDropContent = '<div class="sek-module-placeholder-content"><p>' + html + '</p></div>';
                        break;

                        case 'preset_section' :
                              html = sektionsLocalizedData.i18n['Insert a new section here'];
                              preDropContent = '<div class="sek-module-placeholder-content"><p>' + html + '</p></div>';
                        break;

                        default :
                              api.errare( '::dnd_getPreDropElementContent => invalid content type provided');
                        break;
                  }
                  return preDropContent;
            },

            // Scheduled on previewer('ready') each time the previewer is refreshed
            dnd_getDropZonesElements : function() {
                  return $( api.previewer.targetWindow().document );
            },

            // @return boolean
            // @paraps = { targetEl : $(this), evt : evt }
            // Note : the class "sek-content-preset_section-drop-zone" is dynamically generated in preview::schedulePanelMsgReactions() sek-drag-start case
            dnd_canDrop : function( params ) {
                  params = _.extend( { targetEl : {}, evt : {} }, params || {} );
                  var self = this, $dropTarget = params.targetEl;

                  if ( ! _.isObject( $dropTarget ) || 1 > $dropTarget.length )
                    return false;

                  // stop here if the drop target is not a child of a location
                  if ( $dropTarget.closest('[data-sek-level="location"]').length < 1 )
                    return false;

                  var isSectionDropZone   = $dropTarget.hasClass( 'sek-content-preset_section-drop-zone' ),
                      sectionHasNoModule  = $dropTarget.hasClass( 'sek-module-drop-zone-for-first-module' ),
                      isHeaderLocation    = true === $dropTarget.closest('[data-sek-level="location"]').data('sek-is-header-location'),
                      isFooterLocation    = true === $dropTarget.closest('[data-sek-level="location"]').data('sek-is-footer-location'),
                      isContentSectionCandidate = 'preset_section' === self.dndData.content_type && 'content' === self.dndData.section_type,
                      msg;

                  var maybePrintErrorMessage = function( msg ) {
                        if ( $('.sek-no-drop-possible-message', $dropTarget ).length < 1 ) {
                              $dropTarget.append([
                                    '<div class="sek-no-drop-possible-message">',
                                      '<i class="material-icons">not_interested</i>',
                                      msg,
                                    '</div>'
                              ].join(''));
                        }
                  };

                  if ( ( isHeaderLocation || isFooterLocation ) && isContentSectionCandidate ) {
                        msg = isHeaderLocation ? sektionsLocalizedData.i18n['Header location only accepts modules and pre-built header sections'] : sektionsLocalizedData.i18n['Footer location only accepts modules and pre-built footer sections'];
                        maybePrintErrorMessage( msg );
                        return false;
                  }
                  if ( isFooterLocation && 'preset_section' === self.dndData.content_type && 'header' === self.dndData.section_type ) {
                        msg = sektionsLocalizedData.i18n['You can\'t drop a header section in the footer location'];
                        maybePrintErrorMessage( msg );
                        return false;
                  }

                  if ( isHeaderLocation && 'preset_section' === self.dndData.content_type && 'footer' === self.dndData.section_type ) {
                        msg = sektionsLocalizedData.i18n['You can\'t drop a footer section in the header location'];
                        maybePrintErrorMessage( msg );
                        return false;
                  }

                  return $dropTarget.hasClass('sek-drop-zone') && ( ( 'preset_section' === self.dndData.content_type && isSectionDropZone ) || ( 'module' === self.dndData.content_type && ! isSectionDropZone ) || ( 'preset_section' === self.dndData.content_type && sectionHasNoModule ) );
            },

            // @return void()
            dnd_OnEnterOver : function( $dropTarget, evt ) {
                  evt.preventDefault();//@see :https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations#droptargets
                  // Bail here if we are in the currently drag entered element
                  if ( true !== $dropTarget.data( 'is-drag-entered' ) ) {
                        // Flag now
                        $dropTarget.data( 'is-drag-entered', true );
                        $dropTarget.addClass( 'sek-active-drop-zone' );
                        // Flag the dropEl parent element
                        this.$dropZones.addClass( 'sek-is-dragging' );
                  }

                  try { this.dnd_mayBePrintPreDropElement( $dropTarget, evt ); } catch( er ) {
                        api.errare('Error when trying to insert the preDrop content', er );
                  }
            },

            // @return void()
            dnd_cleanOnLeaveDrop : function( $dropTarget, evt ) {
                  var self = this;
                  this.$dropZones = this.$dropZones || this.dnd_getDropZonesElements();
                  this.preDropElement.remove();
                  this.$dropZones.removeClass( 'sek-is-dragging' );

                  $( sektionsLocalizedData.dropSelectors, this.$dropZones ).each( function() {
                        self.dnd_cleanSingleDropTarget( $(this) );
                  });
            },

            // @return void()
            dnd_cleanSingleDropTarget : function( $dropTarget ) {
                  if ( _.isEmpty( $dropTarget ) || $dropTarget.length < 1 )
                    return;
                  $dropTarget.data( 'is-drag-entered', false );
                  $dropTarget.data( 'preDrop-position', false );
                  $dropTarget.removeClass( 'sek-active-drop-zone' );
                  $dropTarget.find('.sek-drop-zone').removeClass('sek-drag-is-close');
                  $dropTarget.find('.sek-drop-zone').removeClass('sek-drag-is-approaching');

                  $dropTarget.removeClass('sek-feed-me-seymore');

                  $dropTarget.find('.sek-no-drop-possible-message').remove();
            },


            // @return string after or before
            dnd_getPosition : function( $dropTarget, evt ) {
                  var targetRect = $dropTarget[0].getBoundingClientRect(),
                      targetHeight = targetRect.height;

                  // if the preDrop is already printed, we have to take it into account when calc. the target height
                  if ( 'before' === $dropTarget.data( 'preDrop-position' ) ) {
                        targetHeight = targetHeight + this.preDropElement.outerHeight();
                  } else if ( 'after' === $dropTarget.data( 'preDrop-position' ) ) {
                        targetHeight = targetHeight - this.preDropElement.outerHeight();
                  }

                  return evt.originalEvent.clientY - targetRect.top - ( targetHeight / 2 ) > 0  ? 'after' : 'before';
            },

            // @return void()
            dnd_mayBePrintPreDropElement : function( $dropTarget, evt ) {
                  var self = this,
                      previousPosition = $dropTarget.data( 'preDrop-position' ),
                      newPosition = this.dnd_getPosition( $dropTarget, evt  );

                  if ( previousPosition === newPosition )
                    return;

                  if ( true === self.isPrintingPreDrop ) {
                        return;
                  }

                  self.isPrintingPreDrop = true;

                  // make sure we clean the previous wrapper of the pre drop element
                  this.dnd_cleanSingleDropTarget( this.$currentPreDropTarget );
                  var inNewSection = 'between-sections' === $dropTarget.data('sek-location') || 'in-empty-location' === $dropTarget.data('sek-location');
                  $.when( self.preDropElement.remove() ).done( function(){
                        $dropTarget[ 'before' === newPosition ? 'prepend' : 'append' ]( self.preDropElement )
                              .find( '.' + sektionsLocalizedData.preDropElementClass ).html( self.dnd_getPreDropElementContent( evt ) );
                        // Flag the preDrop element with class to apply a specific style if inserted in a new sektion of in a column
                        $dropTarget.find( '.' + sektionsLocalizedData.preDropElementClass ).toggleClass('in-new-sektion', inNewSection );
                        $dropTarget.data( 'preDrop-position', newPosition );

                        $dropTarget.addClass('sek-feed-me-seymore');

                        self.isPrintingPreDrop = false;
                        self.$currentPreDropTarget = $dropTarget;
                  });
            },

            //@return void()
            dnd_isOveringDropTarget : function( $dropTarget, evt ) {
                  var targetRect = $dropTarget[0].getBoundingClientRect(),
                      mouseX = evt.clientX,
                      mouseY = evt.clientY,
                      tLeft = targetRect.left,
                      tRight = targetRect.right,
                      tTop = targetRect.top,
                      tBottom = targetRect.bottom,
                      isXin = mouseX >= tLeft && ( tRight - tLeft ) >= ( mouseX - tLeft),
                      isYin = mouseY >= tTop && ( tBottom - tTop ) >= ( mouseY - tTop);
                  return isXin && isYin;
            },

            //@return void()
            dnd_onDrop: function( $dropTarget, evt ) {
                  evt.stopPropagation();
                  var _position = 'after' === this.dnd_getPosition( $dropTarget, evt ) ? $dropTarget.index() + 1 : $dropTarget.index();
                  // api.infoLog('onDropping params', position, evt );
                  // api.infoLog('onDropping element => ', $dropTarget.data('drop-zone-before-section'), $dropTarget );
                  api.czr_sektions.trigger( 'sek-content-dropped', {
                        drop_target_element : $dropTarget,
                        location : $dropTarget.closest('[data-sek-level="location"]').data('sek-id'),
                        // when inserted between modules
                        before_module : $dropTarget.data('drop-zone-before-module-or-nested-section'),
                        after_module : $dropTarget.data('drop-zone-after-module-or-nested-section'),

                        // When inserted between sections
                        before_section : $dropTarget.data('drop-zone-before-section'),
                        after_section : $dropTarget.data('drop-zone-after-section'),

                        content_type : evt.originalEvent.dataTransfer.getData( "sek-content-type" ),
                        content_id : evt.originalEvent.dataTransfer.getData( "sek-content-id" ),

                        section_type : evt.originalEvent.dataTransfer.getData( "sek-section-type" ),
                        // Saved sections
                        is_user_section : "true" === evt.originalEvent.dataTransfer.getData( "sek-is-user-section" )
                  });
            },














            //-------------------------------------------------------------------------------------------------
            //-- SCHEDULE REACTIONS TO 'sek-content-dropped'
            //-------------------------------------------------------------------------------------------------
            // invoked on api('ready') from self::initialize()
            reactToDrop : function() {
                  var self = this;
                  // @param {
                  //    drop_target_element : $(el) in which the content has been dropped
                  //    position : 'bottom' or 'top' compared to the drop-zone
                  //    before_section : $(this).data('drop-zone-before-section'),
                  //    after_section : $(this).data('drop-zone-after-section'),
                  //    content_type : evt.originalEvent.dataTransfer.getData( "sek-content-type" ),
                  //    content_id : evt.originalEvent.dataTransfer.getData( "sek-content-id" ),
                  //    section_type : evt.originalEvent.dataTransfer.getData( "sek-section-type" ),//<= content, header, footer
                  //    is_user_section : true === evt.originalEvent.dataTransfer.getData( "sek-is-user-section" ),
                  // }
                  var _do_ = function( params ) {
                        if ( ! _.isObject( params ) ) {
                              throw new Error( 'Invalid params provided' );
                        }
                        if ( params.drop_target_element.length < 1 ) {
                              throw new Error( 'Invalid drop_target_element' );
                        }

                        var $dropTarget = params.drop_target_element,
                            dropCase = 'content-in-column';

                        // If the data('sek-location') is available, let's use it
                        switch( $dropTarget.data('sek-location') ) {
                              case 'between-sections' :
                                    dropCase = 'content-in-a-section-to-create';
                              break;
                              case 'in-empty-location' :
                                    params.is_first_section = true;
                                    params.send_to_preview = false;
                                    dropCase = 'content-in-empty-location';
                              break;
                              case 'between-columns' :
                                    dropCase = 'content-in-new-column';
                              break;
                        }

                        // case of a preset_section content_type being added to an existing but empty section
                        if ( 'preset_section' === params.content_type ) {
                              if ( $dropTarget.hasClass( 'sek-module-drop-zone-for-first-module' ) ) {
                                    var $parentSektion = $dropTarget.closest('div[data-sek-level="section"]');
                                    //calculate the number of column in this section, excluding the columns inside nested sections if any
                                    var colNumber = $parentSektion.find('.sek-sektion-inner').first().children( '[data-sek-level="column"]' ).length;
                                    // if the parent section has more than 1 column, we will need to inject the preset_section inside a nested_section
                                    if ( colNumber > 1 ) {
                                          dropCase = 'preset-section-in-a-nested-section-to-create';
                                          params.is_nested = true;
                                          params.in_column = $dropTarget.closest('[data-sek-level="column"]').data('sek-id');
                                          params.in_sektion = $parentSektion.data('sek-id');
                                          //params.after_section = params.sektion_to_replace;
                                    } else {
                                          params.sektion_to_replace = $parentSektion.data('sek-id');
                                          params.after_section = params.sektion_to_replace;
                                          // if the sektion to replace is nested, we will append the new sektion to the parent column of the nested section
                                          params.in_column = $parentSektion.closest('[data-sek-level="column"]').data('sek-id');
                                          dropCase = 'content-in-a-section-to-replace';
                                    }
                              } else {
                                    if ( 'between-sections' === $dropTarget.data('sek-location') ) {
                                          dropCase = 'content-in-a-section-to-create';
                                    }
                              }



                        }

                        var focusOnAddedContentEditor;
                        switch( dropCase ) {
                              case 'content-in-column' :
                                    var $closestLevelWrapper = $dropTarget.closest('div[data-sek-level]');
                                    if ( 1 > $closestLevelWrapper.length ) {
                                        throw new Error( 'No valid level dom element found' );
                                    }
                                    var _level = $closestLevelWrapper.data( 'sek-level' ),
                                        _id = $closestLevelWrapper.data('sek-id');

                                    if ( _.isEmpty( _level ) || _.isEmpty( _id ) ) {
                                        throw new Error( 'No valid level id found' );
                                    }

                                    api.previewer.trigger( 'sek-add-module', {
                                          level : _level,
                                          id : _id,
                                          in_column : $dropTarget.closest('div[data-sek-level="column"]').data( 'sek-id'),
                                          in_sektion : $dropTarget.closest('div[data-sek-level="section"]').data( 'sek-id'),

                                          before_module : params.before_module,
                                          after_module : params.after_module,

                                          content_type : params.content_type,
                                          content_id : params.content_id
                                    });
                              break;

                              case 'content-in-a-section-to-create' :
                                    api.previewer.trigger( 'sek-add-content-in-new-sektion', params );
                              break;
                              // this case fixes https://github.com/presscustomizr/nimble-builder/issues/139
                              case 'content-in-a-section-to-replace' :
                                    api.previewer.trigger( 'sek-add-content-in-new-sektion', params );
                              break;
                              case 'preset-section-in-a-nested-section-to-create' :
                                    api.previewer.trigger( 'sek-add-preset-section-in-new-nested-sektion', params );
                              break;
                              case 'content-in-empty-location' :
                                    api.previewer.trigger( 'sek-add-content-in-new-sektion', params );
                              break;

                              default :
                                    api.errare( 'sek control panel => ::reactToDrop => invalid drop case : ' + dropCase );
                              break;
                              // case 'content-in-new-column' :

                              // break;
                        }
                  };

                  // @see module picker or section picker modules
                  // api.czr_sektions.trigger( 'sek-content-dropped', {
                  //       drop_target_element : $(this),
                  //       position : _position,
                  //       before_section : $(this).data('drop-zone-before-section'),
                  //       after_section : $(this).data('drop-zone-after-section'),
                  //       content_type : evt.originalEvent.dataTransfer.getData( "sek-content-type" ),
                  //       content_id : evt.originalEvent.dataTransfer.getData( "sek-content-id" ),
                  //       is_user_section : true === evt.originalEvent.dataTransfer.getData( "sek-is-user-section" ),
                  // });
                  this.bind( 'sek-content-dropped', function( params ) {
                        //api.infoLog('sek-content-dropped', params );
                        try { _do_( params ); } catch( er ) {
                              api.errare( 'error when reactToDrop', er );
                        }
                  });
            }//reactToDrop
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      $.extend( CZRSeksPrototype, {
            /* This code is inpired from the plugin customize-posts, GPLv2 or later licensed
                Credits : xwp, westonruter, valendesigns, sayedwp, utkarshpatel.
                Date of original code modification : July 2018
            */
            // fired from ::initialize()
            setupTinyMceEditor: function() {
                  var self = this;
                  // OBSERVABLE VALUES
                  api.sekEditorExpanded   = new api.Value( false );
                  //api.sekEditorSynchronizedInput = new api.Value();

                  self.editorEventsListenerSetup = false;//this status will help us ensure that we bind the shared tinyMce instance only once

                  // Cache some dom elements
                  self.$editorPane = $( '#czr-customize-content_editor-pane' );
                  self.$editorDragbar = $( '#czr-customize-content_editor-dragbar' );
                  self.$preview = $( '#customize-preview' );
                  self.$collapseSidebar = $( '.collapse-sidebar' );

                  self.attachResizeEventsToEditor();

                  // Cache the instance and attach
                  var mayBeAwakeTinyMceEditor = function() {
                        api.sekTinyMceEditor = tinyMCE.get( sektionsLocalizedData.idOfDetachedTinyMceTextArea );
                        var _do = function() {
                              if ( false === self.editorEventsListenerSetup ) {
                                    self.editorEventsListenerSetup = true;
                                    self.trigger('sek-tiny-mce-editor-bound-and-instantiated');
                              }
                        };
                        if ( api.sekTinyMceEditor ) {
                              if ( api.sekTinyMceEditor.initialized ) {
                                    _do();
                              } else {
                                    api.sekTinyMceEditor.on( 'init',function() {
                                        _do();
                                    } );
                              }
                        }
                  };

                  // CASE 1)
                  // Toggle the editor visibility
                  // Change the button text
                  // set the clicked input id as the new one
                  $('#customize-theme-controls').on('click', '[data-czr-action="open-tinymce-editor"]', function() {
                        //console.log( '[data-czr-action="toggle-tinymce-editor"]', $(this) , api.sekEditorSynchronizedInput() );
                        // Get the control and the input id from the clicked element
                        // => then updated the synchronized input with them
                        var control_id = $(this).data('czr-control-id'),
                            input_id = $(this).data('czr-input-id');
                        if ( _.isEmpty( control_id ) || _.isEmpty( input_id ) ) {
                              api.errare('toggle-tinymce-editor => missing input or control id');
                              return;
                        }
                        // var currentEditorSyncData = $.extend( true, {}, api.sekEditorSynchronizedInput() ),
                        //     newEditorSyncData = _.extend( currentEditorSyncData, {
                        //           input_id : input_id,
                        //           control_id : control_id
                        //     });
                        //api.sekEditorSynchronizedInput( newEditorSyncData );
                        api.sekEditorExpanded( true );
                        //api.sekTinyMceEditor.focus();
                  });



                  // REACT TO EDITOR VISIBILITY
                  api.sekEditorExpanded.bind( function ( expanded, from, params ) {
                        mayBeAwakeTinyMceEditor();
                        //api.infoLog('in api.sekEditorExpanded', expanded );
                        if ( expanded && api.sekTinyMceEditor ) {
                              api.sekTinyMceEditor.focus();
                        }
                        $(document.body).toggleClass( 'czr-customize-content_editor-pane-open', expanded);

                        /*
                        * Ensure only the latest input is bound
                        */
                        // if ( api.sekTinyMceEditor.locker && api.sekTinyMceEditor.locker !== input ) {
                        //       //api.sekEditorExpanded.set( false );
                        //       api.sekTinyMceEditor.locker = null;
                        // } if ( ! api.sekTinyMceEditor.locker || api.sekTinyMceEditor.locker === input ) {
                        //       $(document.body).toggleClass('czr-customize-content_editor-pane-open', expanded);
                        //       api.sekTinyMceEditor.locker = input;
                        // }

                        $(window)[ expanded ? 'on' : 'off' ]('resize', function() {
                                if ( ! api.sekEditorExpanded() )
                                  return;
                                _.delay( function() {
                                      self.czrResizeEditor( window.innerHeight - self.$editorPane.height() );
                                }, 50 );

                        });

                        if ( expanded ) {
                              self.czrResizeEditor( window.innerHeight - self.$editorPane.height() );
                              // fix wrong height on init https://github.com/presscustomizr/nimble-builder/issues/409
                              // there's probably a smarter way to get the right height on init. But let's be lazy.
                              _.delay( function() {
                                    $(window).trigger('resize');
                              }, 100 );
                        } else {
                              //resize reset
                              //self.container.closest( 'ul.accordion-section-content' ).css( 'padding-bottom', '' );
                              self.$preview.css( 'bottom', '' );
                              self.$collapseSidebar.css( 'bottom', '' );
                        }
                  });




                  // COLLAPSING THE EDITOR
                  // or on click on the icon located on top of the editor
                  $('#czr-customize-content_editor-pane' ).on('click', '[data-czr-action="close-tinymce-editor"]', function() {
                        api.sekEditorExpanded( false );
                  });

                  // on click anywhere but on the 'Edit' ( 'open-tinymce-editor' action ) button
                  $('#customize-controls' ).on('click', function( evt ) {
                        if ( 'open-tinymce-editor' == $( evt.target ).data( 'czr-action') )
                          return;
                        api.sekEditorExpanded( false, { context : "clicked anywhere"} );
                  });

                  // Pressing the escape key collapses the editor
                  // both in the customizer panel and the editor frame
                  $(document).on( 'keydown', _.throttle( function( evt ) {
                        if ( 27 === evt.keyCode ) {
                              api.sekEditorExpanded( false );
                        }
                  }, 50 ));

                  self.bind('sek-tiny-mce-editor-bound-and-instantiated', function() {
                        var iframeDoc = $( api.sekTinyMceEditor.iframeElement ).contents().get(0);
                        $( iframeDoc ).on('keydown', _.throttle( function( evt ) {
                              if ( 27 === evt.keyCode ) {
                                    api.sekEditorExpanded( false );
                              }
                        }, 50 ));
                  });

                  _.each( [
                        'sek-click-on-inactive-zone',
                        'sek-add-section',
                        'sek-add-column',
                        'sek-add-module',
                        'sek-remove',
                        'sek-move',
                        'sek-duplicate',
                        'sek-resize-columns',
                        'sek-add-content-in-new-sektion',
                        'sek-pick-content',
                        'sek-edit-options',
                        'sek-edit-module',
                        'sek-notify'
                  ], function( _evt_ ) {
                        if ( 'sek-edit-module' != _evt_ ) {
                              api.previewer.bind( _evt_, function() { api.sekEditorExpanded( false ); } );
                        } else {
                              api.previewer.bind( _evt_, function( params ) {
                                    api.sekEditorExpanded(  params.module_type === 'czr_tiny_mce_editor_module' );
                              });
                        }
                  });
            },//setupTinyMceEditor




            attachResizeEventsToEditor : function() {
                  var self = this;
                  // LISTEN TO USER DRAG ACTIONS => RESIZE EDITOR
                  // Note : attaching event to the dragbar element was broken => the mouseup event could not be triggered for some reason, probably because adding the class "czr-customize-content_editor-pane-resize", makes us lose access to the dragbar element
                  // => that's why we listen for the mouse events when they have bubbled up to the parent wrapper, and then check if the target is our candidate.
                  $('#czr-customize-content_editor-pane').on( 'mousedown mouseup', function( evt ) {
                        if ( 'mousedown' === evt.type && 'czr-customize-content_editor-dragbar' !== $(evt.target).attr('id') && ! $(evt.target).hasClass('czr-resize-handle') )
                          return;
                        if ( ! api.sekEditorExpanded() )
                          return;
                        switch( evt.type ) {
                              case 'mousedown' :
                                    $( document ).on( 'mousemove.' + sektionsLocalizedData.idOfDetachedTinyMceTextArea, function( event ) {
                                          event.preventDefault();
                                          $( document.body ).addClass( 'czr-customize-content_editor-pane-resize' );
                                          $( '#czr-customize-content_editor_ifr' ).css( 'pointer-events', 'none' );
                                          self.czrResizeEditor( event.pageY );
                                    });
                              break;

                              case 'mouseup' :
                                    $( document ).off( 'mousemove.' + sektionsLocalizedData.idOfDetachedTinyMceTextArea );
                                    $( document.body ).removeClass( 'czr-customize-content_editor-pane-resize' );
                                    $( '#czr-customize-content_editor_ifr' ).css( 'pointer-events', '' );
                              break;
                        }
                  });
            },


            czrResizeEditor : function( position ) {
              var self = this,
                  //$sectionContent = input.container.closest( 'ul.accordion-section-content' ),
                  windowHeight = window.innerHeight,
                  windowWidth = window.innerWidth,
                  minScroll = 40,
                  maxScroll = 1,
                  mobileWidth = 782,
                  collapseMinSpacing = 56,
                  collapseBottomOutsideEditor = 8,
                  collapseBottomInsideEditor = 4,
                  args = {},
                  resizeHeight;

              var $editorFrame  = $( '#czr-customize-content_editor_ifr' ),
                  $mceTools     = $( '#wp-czr-customize-content_editor-tools' ),
                  $mceToolbar   = self.$editorPane.find( '.mce-toolbar-grp' ),
                  $mceStatusbar = self.$editorPane.find( '.mce-statusbar' );


              if ( ! api.sekEditorExpanded() ) {
                return;
              }

              if ( ! _.isNaN( position ) ) {
                    resizeHeight = windowHeight - position;
              }

              args.height = resizeHeight;
              args.components = $mceTools.outerHeight() + $mceToolbar.outerHeight() + $mceStatusbar.outerHeight();

              if ( resizeHeight < minScroll ) {
                    args.height = minScroll;
              }

              if ( resizeHeight > windowHeight - maxScroll ) {
                    args.height = windowHeight - maxScroll;
              }

              if ( windowHeight < self.$editorPane.outerHeight() ) {
                    args.height = windowHeight;
              }

              self.$preview.css( 'bottom', args.height );
              self.$editorPane.css( 'height', args.height );
              $editorFrame.css( 'height', args.height - args.components );

              // the code hereafter is not needed.
              // don't remember why it was included from the beginning...
              // self.$collapseSidebar.css(
              //       'bottom',
              //       collapseMinSpacing > windowHeight - args.height ? $mceStatusbar.outerHeight() + collapseBottomInsideEditor : args.height + collapseBottomOutsideEditor
              // );

              //$sectionContent.css( 'padding-bottom',  windowWidth <= mobileWidth ? args.height : '' );
      }
      });//$.extend()
})( wp.customize, jQuery );//global sektionsLocalizedData
var CZRSeksPrototype = CZRSeksPrototype || {};
(function ( api, $ ) {
      // Skope
      $.extend( CZRSeksPrototype, api.Events );
      var CZR_SeksConstructor   = api.Class.extend( CZRSeksPrototype );

      // Schedule skope instantiation on api ready
      // api.bind( 'ready' , function() {
      //       api.czr_skopeBase   = new api.CZR_SeksConstructor();
      // });
      try { api.czr_sektions = new CZR_SeksConstructor(); } catch( er ) {
            api.errare( 'api.czr_sektions => problem on instantiation', er );
      }
})( wp.customize, jQuery );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};


      // HELPERS USED IN ALL SPACING INPUT TYPES
      // "this" is input
      var validateUnit = function( unit ) {
            if ( ! _.contains( ['px', 'em', '%'], unit ) ) {
                  api.errare( 'error : invalid unit for input ' + this.id, unit );
                  unit = 'px';
            }
            return unit;
          },
          stripUnit = function( value ) {
                return _.isString( value ) ? value.replace(/px|em|%/g,'') : '';
          },
          unitButtonsSetup = function( $wrapper ) {
                var input = this;
                // Schedule unit changes on button click
                // @param params can be { previewed_device_switched : true }
                $wrapper.on( 'click', '.sek-ui-button', function( evt, params ) {
                      evt.preventDefault();
                      // handle the is-selected css class toggling
                      $wrapper.find('.sek-ui-button').removeClass('is-selected').attr( 'aria-pressed', false );
                      $(this).addClass('is-selected').attr( 'aria-pressed', true );
                      // set the current unit Value
                      input.css_unit( $(this).data('sek-unit'), params );
                });

                // add is-selected button on init to the relevant unit button
                $wrapper.find( '.sek-ui-button[data-sek-unit="'+ ( input.initial_unit || 'px' ) +'"]').addClass('is-selected').attr( 'aria-pressed', true );
          },
          setupResetAction = function( $wrapper, defaultVal ) {
                var input = this;
                $wrapper.on( 'click', '.reset-spacing-wrap', function(evt) {
                      evt.preventDefault();
                      $wrapper.find('input[type="number"]').each( function() {
                            $(this).val('');
                      });

                      input( defaultVal );
                      // Reset unit to pixels
                      $('.sek-unit-wrapper', $wrapper ).find('[data-sek-unit="px"]').trigger('click');
                });
          };



      /* ------------------------------------------------------------------------- *
       *  SPACING CLASSIC
      /* ------------------------------------------------------------------------- */
      $.extend( api.czrInputMap, {
            spacing : function( input_options ) {
                  var input = this,
                      $wrapper = $('.sek-spacing-wrapper', input.container ),
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                      defaultVal = ( ! _.isEmpty( inputRegistrationParams ) && ! _.isEmpty( inputRegistrationParams.default ) ) ? inputRegistrationParams.default : [];

                  // Listen to user actions on the inputs and set the input value
                  $wrapper.on( 'input', 'input[type="number"]', function(evt) {
                        var _type_ = $(this).closest('[data-sek-spacing]').data('sek-spacing'),
                            _newInputVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} ),
                            _rawVal = $(this).val();

                        // Validates
                        // @fixes https://github.com/presscustomizr/nimble-builder/issues/26
                        if ( ( _.isString( _rawVal ) && ! _.isEmpty( _rawVal ) ) || _.isNumber( _rawVal ) ) {
                              _newInputVal[ _type_ ] = _rawVal;
                        } else {
                              // this allow users to reset a given padding / margin instead of reseting them all at once with the "reset all spacing" option
                              _newInputVal = _.omit( _newInputVal, _type_ );
                        }
                        input( _newInputVal );
                  });
                  // Schedule a reset action
                  setupResetAction.call( input, $wrapper, defaultVal );

                  // Synchronize on init
                  if ( _.isObject( input() ) ) {
                        _.each( input(), function( _val_, _key_ ) {
                              $( '[data-sek-spacing="' + _key_ +'"]', $wrapper ).find( 'input[type="number"]' ).val( _val_ );
                        });
                        // loop on the unit buttons and check which one should be clicked
                        var unitToActivate = 'px';
                        $('.sek-unit-wrapper .sek-ui-button', input.container ).each( function() {
                              var unit = $(this).data('sek-unit');
                              // do we have a unit for the current device ?
                              if ( ! _.isEmpty( input() ) ) {
                                    if ( ! _.isEmpty( input()[ 'unit' ] ) ) {
                                          if ( unit === input()[ 'unit' ] ) {
                                                unitToActivate = unit;
                                          }
                                    }
                              }
                        });
                        $('.sek-unit-wrapper', input.container ).find('[data-sek-unit="' + validateUnit.call( input, unitToActivate ) + '"]').trigger('click');
                  }

                  // Set the initial unit
                  var initial_value = input();
                  input.initial_unit = 'px';
                  if ( ! _.isEmpty( initial_value )  ) {
                        input.initial_unit = _.isEmpty( initial_value['unit'] ) ? 'px' : initial_value['unit'];
                  }

                  // initialize the unit with the value provided in the dom
                  input.css_unit = new api.Value( validateUnit.call( input, input.initial_unit ) );

                  // React to a unit change
                  input.css_unit.bind( function( to ) {
                        to = _.isEmpty( to ) ? 'px' : to;
                        var _newInputVal;

                        _newInputVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                        _newInputVal[ 'unit' ] = to;
                        input( _newInputVal );
                  });

                  // Schedule unit changes on button click
                  // add is-selected button on init to the relevant unit button
                  unitButtonsSetup.call( input, $wrapper );
            }
      });//$.extend( api.czrInputMap, {})















      /* ------------------------------------------------------------------------- *
       *  SPACING WITH DEVICE SWITCHER
      /* ------------------------------------------------------------------------- */
      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            spacingWithDeviceSwitcher : function( input_options ) {
                  // DEFINITIONS
                  var input = this,
                      $wrapper = $('.sek-spacing-wrapper', input.container ),
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                      defaultVal = ( ! _.isEmpty( inputRegistrationParams ) && ! _.isEmpty( inputRegistrationParams.default ) ) ? inputRegistrationParams.default : {};

                  // Recursive helper
                  // return the value set for the currently previewed device if exists
                  // OR
                  // return the inherited value from the first parent device for which the value is set
                  // OR
                  // falls back on the module default
                  var getCurrentDeviceActualOrInheritedValue = function( inputValues, currentDevice ) {
                        var deviceHierarchy = [ 'mobile' , 'tablet', 'desktop' ];
                        if ( _.has( inputValues, currentDevice ) ) {
                              return inputValues[ currentDevice ];
                        } else {
                              var deviceIndex = _.findIndex( deviceHierarchy, function( _d_ ) { return currentDevice === _d_; });
                              if ( ! _.isEmpty( currentDevice ) && deviceIndex < deviceHierarchy.length ) {
                                    return getCurrentDeviceActualOrInheritedValue( inputValues, deviceHierarchy[ deviceIndex + 1 ] );
                              } else {
                                    return {};
                              }
                        }
                  };

                  // Synchronizes on init + refresh on previewed device changes
                  var syncWithPreviewedDevice = function( currentDevice ) {
                        var inputValues = $.extend( true, {}, _.isObject( input() ) ? input() : {} ),
                            clonedDefault = $.extend( true, {}, defaultVal );
                        inputValues = _.isObject( inputValues ) ? $.extend( clonedDefault, inputValues ) : clonedDefault;
                        var _currentDeviceValues = getCurrentDeviceActualOrInheritedValue( inputValues, currentDevice );

                        // loop on each sek spacing and check if we find a value to write for this device
                        $( '[data-sek-spacing]', $wrapper ).each( function() {
                              var spacingType = $(this).data('sek-spacing'),
                                  _val_ = '';
                              // do we have a val for the current device ?
                              if ( ! _.isEmpty( _currentDeviceValues ) ) {
                                    if ( ! _.isEmpty( _currentDeviceValues[ spacingType ] ) ) {
                                          _val_ = _currentDeviceValues[ spacingType ];
                                    }
                              }
                              $(this).find( 'input[type="number"]' ).val( _val_ );
                        });

                        // loop on the unit button and check which one should be clicked
                        var unitToActivate = 'px';
                        $( '.sek-unit-wrapper .sek-ui-button', input.container).each( function() {
                              var unit = $(this).data('sek-unit');
                              // do we have a unit for the current device ?
                              if ( ! _.isEmpty( _currentDeviceValues ) ) {
                                    if ( ! _.isEmpty( _currentDeviceValues[ 'unit' ] ) ) {
                                          if ( unit === _currentDeviceValues[ 'unit' ] ) {
                                                unitToActivate = unit;
                                          }
                                    }
                              }
                        });
                        $('.sek-unit-wrapper', input.container ).find('[data-sek-unit="' + validateUnit.call( input, unitToActivate ) + '"]').trigger('click', { previewed_device_switched : true });// We don't want to update the input();
                  };




                  // SETUP
                  api.czr_sektions.maybeSetupDeviceSwitcherForInput.call( input );

                  // Set the initial unit
                  var initial_value = input();
                  input.initial_unit = 'px';
                  if ( ! _.isEmpty( initial_value ) && ! _.isEmpty( initial_value[ input.previewedDevice() ] ) ) {
                        input.initial_unit = _.isEmpty( initial_value[ input.previewedDevice() ]['unit'] ) ? 'px' : initial_value[ input.previewedDevice() ]['unit'];
                  }

                  // initialize the unit with the value provided in the dom
                  input.css_unit = new api.Value( validateUnit.call( input, input.initial_unit ) );




                  // SCHEDULE REACTIONS
                  // Listen to user actions on the inputs and set the input value
                  $wrapper.on( 'input', 'input[type="number"]', function(evt) {
                        var changedSpacingType    = $(this).closest('[data-sek-spacing]').data('sek-spacing'),
                            changedNumberInputVal = $(this).val(),
                            _newInputVal,
                            previewedDevice = api.previewedDevice() || 'desktop';

                        _newInputVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                        _newInputVal[ previewedDevice ] = $.extend( true, {}, _newInputVal[ previewedDevice ] || {} );
                        // Validates
                        // @fixes https://github.com/presscustomizr/nimble-builder/issues/26
                        if ( ( _.isString( changedNumberInputVal ) && ! _.isEmpty( changedNumberInputVal ) ) || _.isNumber( changedNumberInputVal ) ) {
                              _newInputVal[ previewedDevice ][ changedSpacingType ] = changedNumberInputVal;
                        } else {
                              // this allow users to reset a given padding / margin instead of reseting them all at once with the "reset all spacing" option
                              _newInputVal[ previewedDevice ] = _.omit( _newInputVal[ previewedDevice ], changedSpacingType );
                        }

                        input( _newInputVal );
                  });

                  // Schedule a reset action
                  setupResetAction.call( input, $wrapper, defaultVal );

                  // react to previewed device changes
                  // input.previewedDevice is updated in api.czr_sektions.maybeSetupDeviceSwitcherForInput()
                  input.previewedDevice.bind( function( currentDevice ) {
                        try { syncWithPreviewedDevice( currentDevice ); } catch( er ) {
                              api.errare('Error when firing syncWithPreviewedDevice for input type spacingWithDeviceSwitcher for input id ' + input.id , er );
                        }
                  });


                  // React to a unit change
                  // Don't move when switching the device
                  input.css_unit.bind( function( to, from, params ) {
                        if ( _.isObject( params ) && true === params.previewed_device_switched )
                          return;
                        to = _.isEmpty( to ) ? 'px' : to;
                        var _newInputVal,
                            previewedDevice = input.previewedDevice() || 'desktop';

                        _newInputVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                        _newInputVal[ previewedDevice ] = $.extend( true, {}, _newInputVal[ previewedDevice ] || {} );
                        _newInputVal[ previewedDevice ][ 'unit' ] = to;
                        input( _newInputVal );
                  });

                  // Schedule unit changes on button click
                  // add is-selected button on init to the relevant unit button
                  unitButtonsSetup.call( input, $wrapper );



                  // INITIALIZES
                  try { syncWithPreviewedDevice( api.previewedDevice() ); } catch( er ) {
                        api.errare('Error when firing syncWithPreviewedDevice for input type spacingWithDeviceSwitcher for input id ' + input.id , er );
                  }
            }
      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            /* ------------------------------------------------------------------------- *
             *  BG POSITION SIMPLE
            /* ------------------------------------------------------------------------- */
            bg_position : function( input_options ) {
                  var input = this;
                  // Listen to user actions on the inputs and set the input value
                  $('.sek-bg-pos-wrapper', input.container ).on( 'change', 'input[type="radio"]', function(evt) {
                        input( $(this).val() );
                  });

                  // Synchronize on init
                  if ( ! _.isEmpty( input() ) ) {
                        input.container.find('input[value="'+ input() +'"]').attr('checked', true).trigger('click');
                  }
            },


            /* ------------------------------------------------------------------------- *
             *  BG POSITION WITH DEVICE SWITCHER
            /* ------------------------------------------------------------------------- */
            bgPositionWithDeviceSwitcher : function( input_options ) {
                  var input = this,
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                      defaultVal = ( ! _.isEmpty( inputRegistrationParams ) && ! _.isEmpty( inputRegistrationParams.default ) ) ? inputRegistrationParams.default : {};

                  // SETUP
                  api.czr_sektions.maybeSetupDeviceSwitcherForInput.call( input );

                  var getCurrentDeviceActualOrInheritedValue = function( inputValues, currentDevice ) {
                        var deviceHierarchy = [ 'mobile' , 'tablet', 'desktop' ];
                        if ( _.has( inputValues, currentDevice ) ) {
                              return inputValues[ currentDevice ];
                        } else {
                              var deviceIndex = _.findIndex( deviceHierarchy, function( _d_ ) { return currentDevice === _d_; });
                              if ( ! _.isEmpty( currentDevice ) && deviceIndex < deviceHierarchy.length ) {
                                    return getCurrentDeviceActualOrInheritedValue( inputValues, deviceHierarchy[ deviceIndex + 1 ] );
                              } else {
                                    return {};
                              }
                        }
                  };

                  // Synchronizes on init + refresh on previewed device changes
                  var syncWithPreviewedDevice = function( currentDevice ) {
                        var inputValues = $.extend( true, {}, _.isObject( input() ) ? input() : {} ),
                            clonedDefault = $.extend( true, {}, defaultVal );
                        inputValues = _.isObject( inputValues ) ? $.extend( clonedDefault, inputValues ) : clonedDefault;
                        var _currentDeviceValue = getCurrentDeviceActualOrInheritedValue( inputValues, currentDevice );

                        input.container.find('input[value="'+ _currentDeviceValue +'"]').attr('checked', true).trigger('click', { previewed_device_switched : true } );
                  };



                  // Listen to user actions on the inputs and set the input value
                  $('.sek-bg-pos-wrapper', input.container ).on( 'change', 'input[type="radio"]', function( evt ) {
                        var changedRadioVal = $(this).val(),
                            _newInputVal;

                        _newInputVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                        _newInputVal[ api.previewedDevice() || 'desktop' ] = changedRadioVal;

                        input( _newInputVal );
                  });


                  // react to previewed device changes
                  // input.previewedDevice is updated in api.czr_sektions.maybeSetupDeviceSwitcherForInput()
                  input.previewedDevice.bind( function( currentDevice ) {
                        try { syncWithPreviewedDevice( currentDevice ); } catch( er ) {
                              api.errare('Error when firing syncWithPreviewedDevice for input type spacingWithDeviceSwitcher for input id ' + input.id , er );
                        }
                  });

                  // INITIALIZES
                  try { syncWithPreviewedDevice( api.previewedDevice() ); } catch( er ) {
                        api.errare('Error when firing syncWithPreviewedDevice for input type bgPositionWithDeviceSwitcher for input id ' + input.id , er );
                  }
            }
      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // Generic method to instantiate the following input types :
      // horizTextAlignmentWithDeviceSwitcher and horizAlignmentWithDeviceSwitcher => tmpl => 3_0_5_sek_input_tmpl_horizontal_alignment.php
      // verticalAlignWithDeviceSwitcher => tmpl => 3_0_6_sek_input_tmpl_vertical_alignment.php
      var x_or_y_AlignWithDeviceSwitcher = function( params ) {
            var input = this,
                inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                defaultVal = ( ! _.isEmpty( inputRegistrationParams ) && ! _.isEmpty( inputRegistrationParams.default ) ) ? inputRegistrationParams.default : {},
                tmplSelector = 'verticalAlignWithDeviceSwitcher' === input.type ? '.sek-v-align-wrapper' : '.sek-h-align-wrapper',// <= because used by 2 different input tmpl
                $wrapper = $( tmplSelector, input.container );

            // SETUP
            api.czr_sektions.maybeSetupDeviceSwitcherForInput.call( input );

            var getCurrentDeviceActualOrInheritedValue = function( inputValues, currentDevice ) {
                  var deviceHierarchy = [ 'mobile' , 'tablet', 'desktop' ];
                  if ( _.has( inputValues, currentDevice ) ) {
                        return inputValues[ currentDevice ];
                  } else {
                        var deviceIndex = _.findIndex( deviceHierarchy, function( _d_ ) { return currentDevice === _d_; });
                        if ( ! _.isEmpty( currentDevice ) && deviceIndex < deviceHierarchy.length ) {
                              return getCurrentDeviceActualOrInheritedValue( inputValues, deviceHierarchy[ deviceIndex + 1 ] );
                        } else {
                              return {};
                        }
                  }
            };

            // Synchronizes on init + refresh on previewed device changes
            var syncWithPreviewedDevice = function( currentDevice ) {
                  var inputValues = $.extend( true, {}, _.isObject( input() ) ? input() : {} ),
                      clonedDefault = $.extend( true, {}, defaultVal );
                  inputValues = _.isObject( inputValues ) ? $.extend( clonedDefault, inputValues ) : clonedDefault;
                  var _currentDeviceValue = getCurrentDeviceActualOrInheritedValue( inputValues, currentDevice );

                  //input.container.find('input[value="'+ _currentDeviceValue +'"]').attr('checked', true).trigger('click', { previewed_device_switched : true } );
                  $wrapper.find('.selected').removeClass('selected');
                  $wrapper.find( 'div[data-sek-align="' + _currentDeviceValue +'"]' ).addClass('selected');
            };

            // on click
            $wrapper.on( 'click', '[data-sek-align]', function(evt) {
                  evt.preventDefault();
                  var _newInputVal;

                  _newInputVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                  _newInputVal[ api.previewedDevice() || 'desktop' ] = $(this).data('sek-align');

                  $wrapper.find('.selected').removeClass('selected');
                  $.when( $(this).addClass('selected') ).done( function() {
                        input( _newInputVal );
                  });
            });

            // react to previewed device changes
            // input.previewedDevice is updated in api.czr_sektions.maybeSetupDeviceSwitcherForInput()
            input.previewedDevice.bind( function( currentDevice ) {
                  try { syncWithPreviewedDevice( currentDevice ); } catch( er ) {
                        api.errare('Error when firing syncWithPreviewedDevice for input type : ' + input.type + ' for input id ' + input.id , er );
                  }
            });

            // INITIALIZES
            try { syncWithPreviewedDevice( api.previewedDevice() ); } catch( er ) {
                  api.errare('Error when firing syncWithPreviewedDevice for input type : ' + input.type + ' for input id ' + input.id , er );
            }
      };


      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            horizTextAlignmentWithDeviceSwitcher : x_or_y_AlignWithDeviceSwitcher,
            horizAlignmentWithDeviceSwitcher : x_or_y_AlignWithDeviceSwitcher,
            verticalAlignWithDeviceSwitcher : x_or_y_AlignWithDeviceSwitcher
      });//$.extend( api.czrInputMap, {})
})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            font_size : function( params ) {
                  api.czr_sektions.setupFontSizeAndLineHeightInputs.call(this);
            },

      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            line_height : function( params ) {
                  api.czr_sektions.setupFontSizeAndLineHeightInputs.call(this);
            }
      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            // FONT PICKER
            font_picker : function( input_options ) {
                  var input = this,
                      item = input.input_parent;

                  var _getFontCollections = function() {
                        var dfd = $.Deferred();
                        if ( ! _.isEmpty( api.sek_fontCollections ) ) {
                              dfd.resolve( api.sek_fontCollections );
                        } else {
                              var _ajaxRequest_;
                              if ( ! _.isUndefined( api.sek_fetchingFontCollection ) && 'pending' == api.sek_fetchingFontCollection.state() ) {
                                    _ajaxRequest_ = api.sek_fetchingFontCollection;
                              } else {
                                    // This utility handles a cached version of the font_list once fetched the first time
                                    // @see api.CZR_Helpers.czr_cachedTmpl
                                    _ajaxRequest_ = api.CZR_Helpers.getModuleTmpl( {
                                          tmpl : 'font_list',
                                          module_type: 'font_picker_input',
                                          module_id : input.module.id
                                    } );
                                    api.sek_fetchingFontCollection = _ajaxRequest_;
                              }
                              _ajaxRequest_.done( function( _serverTmpl_ ) {
                                    // Ensure we have a string that's JSON.parse-able
                                    if ( typeof _serverTmpl_ !== 'string' || _serverTmpl_[0] !== '{' ) {
                                          throw new Error( 'font_picker => server list is not JSON.parse-able');
                                    }
                                    api.sek_fontCollections = JSON.parse( _serverTmpl_ );
                                    dfd.resolve( api.sek_fontCollections );
                              }).fail( function( _r_ ) {
                                    dfd.reject( _r_ );
                              });

                        }
                        return dfd.promise();
                  };
                  var _preprocessSelect2ForFontFamily = function() {
                        /*
                        * Override czrSelect2 Results Adapter in order to select on highlight
                        * deferred needed cause the selects needs to be instantiated when this override is complete
                        * selec2.amd.require is asynchronous
                        */
                        var selectFocusResults = $.Deferred();
                        if ( 'undefined' !== typeof $.fn.czrSelect2 && 'undefined' !== typeof $.fn.czrSelect2.amd && 'function' === typeof $.fn.czrSelect2.amd.require ) {
                              $.fn.czrSelect2.amd.require(['czrSelect2/results', 'czrSelect2/utils'], function (Result, Utils) {
                                    var ResultsAdapter = function($element, options, dataAdapter) {
                                      ResultsAdapter.__super__.constructor.call(this, $element, options, dataAdapter);
                                    };
                                    Utils.Extend(ResultsAdapter, Result);
                                    ResultsAdapter.prototype.bind = function (container, $container) {
                                      var _self = this;
                                      container.on('results:focus', function (params) {
                                        if ( params.element.attr('aria-selected') != 'true') {
                                          _self.trigger('select', {
                                              data: params.data
                                          });
                                        }
                                      });
                                      ResultsAdapter.__super__.bind.call(this, container, $container);
                                    };
                                    selectFocusResults.resolve( ResultsAdapter );
                              });
                        }
                        else {
                              selectFocusResults.resolve( false );
                        }

                        return selectFocusResults.promise();

                  };//_preprocessSelect2ForFontFamily

                  // @return void();
                  // Instantiates a czrSelect2 select input
                  // http://ivaynberg.github.io/czrSelect2/#documentation
                  var _setupSelectForFontFamilySelector = function( customResultsAdapter, fontCollections ) {
                        var _model = item(),
                            _googleFontsFilteredBySubset = function() {
                                  var subset = item.czr_Input('subset')(),
                                      filtered = _.filter( fontCollections.gfonts, function( data ) {
                                            return data.subsets && _.contains( data.subsets, subset );
                                      });

                                  if ( ! _.isUndefined( subset ) && ! _.isNull( subset ) && 'all-subsets' != subset ) {
                                        return filtered;
                                  } else {
                                        return fontCollections.gfonts;
                                  }

                            },
                            $fontSelectElement = $( 'select[data-czrtype="' + input.id + '"]', input.container );

                        // generates the options
                        // @param type = cfont or gfont
                        var _generateFontOptions = function( fontList, type ) {
                              var _html_ = '';
                              _.each( fontList , function( font_data ) {
                                    var _value = _.isString( font_data.name ) ? font_data.name  : 'Undefined Font Family',
                                        optionTitle = _value.replace(/[+|:]/g, ' ' ),
                                        _maybeSetFontTypePrefix = function( val, type ) {
                                              if ( _.isEmpty( type ) )
                                                return val;
                                              return _.isString( val ) ? [ '[', type, ']', val ].join('') : '';//<= Example : [gfont]Aclonica:regular
                                        };

                                    _value = _maybeSetFontTypePrefix( _value, type );
                                    optionTitle = optionTitle.replace('[cfont]', '').replace('[gfont]', '');
                                    if ( _value == input() ) {
                                          _html_ += '<option selected="selected" value="' + _value + '">' + optionTitle + '</option>';
                                    } else {
                                          _html_ += '<option value="' + _value + '">' + optionTitle + '</option>';
                                    }
                              });
                              return _html_;
                        };

                        //add the first option
                        if ( _.isNull( input() ) || _.isEmpty( input() ) ) {
                              $fontSelectElement.append( '<option value="none" selected="selected">' + sektionsLocalizedData.i18n['Select a font family'] + '</option>' );
                        } else {
                              $fontSelectElement.append( '<option value="none">' + sektionsLocalizedData.i18n['Select a font family'] + '</option>' );
                        }

                        // declare the font list collection : most used, cfont, gfont
                        var _fontCollection = [
                              {
                                    title : sektionsLocalizedData.i18n['Web safe fonts'],
                                    type : 'cfont',
                                    list : fontCollections.cfonts
                              },
                              {
                                    title : sektionsLocalizedData.i18n['Google fonts'],
                                    type : 'gfont',
                                    list : fontCollections.gfonts//_googleFontsFilteredBySubset()
                              }
                        ];

                        // Server fonts are stored as an array of gfonts with duplicates no removed
                        // 0: "[gfont]Raleway:800"
                        // 1: "[gfont]Roboto:regular"
                        // 2: "[gfont]Montserrat:regular"
                        // 3: "[gfont]Exo+2:800italic"
                        // 4: "[gfont]Raleway:800"
                        // 5: "[gfont]Roboto:regular"


                        //
                        // SERVER FONTS is a merge of the uniq gfont array of all skopes. Because each skopes font are stored in the .fonts property of a section setting, each time a new font is used in the customizer.
                        // The resulting SERVER FONTS array can have duplicatesd google fonts, if two skopes use the same font for example.
                        //
                        // How do we increase the weight of locally used gfont for the currently customized skope ?
                        // => AllFontsInApi is a raw list of all fonts, web safe and google fonts, with duplicates not removed
                        // those fonts are the one of the current skope + global sections fonts + global options fonts
                        // Server and api fonts are merged
                        // Since duplicates are not removed from api fonts, a frequently used local font can be quickly positionned on top of the list.
                        var allFontsInApi = api.czr_sektions.sniffAllFonts();
                        var allServerSentFonts = sektionsLocalizedData.alreadyUsedFonts;

                        var _alreadyUsedFonts = [],
                            _allFonts = [];

                        if ( ! _.isEmpty( allServerSentFonts ) && _.isObject( allServerSentFonts ) ) {
                              _.each( allServerSentFonts, function( _font ){
                                    _allFonts.push( _font );
                              });
                        }

                        if ( _.isArray( allFontsInApi ) ) {
                              _.each( allFontsInApi, function( _font ) {
                                    _allFonts.push( _font );
                              });
                        }

                        if ( !_.isEmpty( _allFonts ) ) {
                              // order fonts by number of occurences
                              var _occurencesMap = {},
                                  _fontsOrderedByOccurences = [];
                              // Creates the occurence map
                              _allFonts.forEach(function(i) { _occurencesMap[i] = (_occurencesMap[i]||0) + 1;});

                              // isolate only the occurence number in an array
                              var _occurences =  _.sortBy(_occurencesMap, function(num){ return num; });

                              _.each( _occurences, function( nb ) {
                                    _.each( _occurencesMap, function( nbOccurence, fontName ) {
                                          if ( nb === nbOccurence && !_.contains( _fontsOrderedByOccurences, fontName ) ) {
                                                // unshift because the occurencesMap is in ascending order, and we want the most used fonts at the beginning
                                                _fontsOrderedByOccurences.unshift( fontName );
                                          }
                                    });
                              });

                              // normalizes the most used font collection, like other font collection [{name:'font1'}, {...}, ... ]
                              _.each( _fontsOrderedByOccurences, function( fontName ){
                                    _alreadyUsedFonts.push({name : fontName });
                              });
                              _fontCollection.unshift( {
                                    title : sektionsLocalizedData.i18n['Already used fonts'],
                                    type : null,//already set for Most used fonts
                                    list : _alreadyUsedFonts
                              });
                        }//if ( !_.isEmpty( _allFonts ) )


                        // generate the cfont and gfont html
                        _.each( _fontCollection, function( fontData ) {
                              var $optGroup = $('<optgroup>', { label : fontData.title , html : _generateFontOptions( fontData.list, fontData.type ) });
                              $fontSelectElement.append( $optGroup );
                        });

                        var _fonts_czrSelect2_params = {
                                //minimumResultsForSearch: -1, //no search box needed
                            //templateResult: paintFontOptionElement,
                            //templateSelection: paintFontOptionElement,
                            escapeMarkup: function(m) { return m; },
                        };
                        /*
                        * Maybe use custom adapter
                        */
                        if ( customResultsAdapter ) {
                              $.extend( _fonts_czrSelect2_params, {
                                    resultsAdapter: customResultsAdapter,
                                    closeOnSelect: false,
                              } );
                        }

                        //http://ivaynberg.github.io/czrSelect2/#documentation
                        //FONTS
                        $fontSelectElement.czrSelect2( _fonts_czrSelect2_params );
                        $( '.czrSelect2-selection__rendered', input.container ).css( getInlineFontStyle( input() ) );

                  };//_setupSelectForFontFamilySelector

                  // @return {} used to set $.css()
                  // @param font {string}.
                  // Example : Aclonica:regular
                  // Example : Helvetica Neue, Helvetica, Arial, sans-serif
                  var getInlineFontStyle = function( _fontFamily_ ){
                        // the font is set to 'none' when "Select a font family" option is picked
                        if ( ! _.isString( _fontFamily_ ) || _.isEmpty( _fontFamily_ ) )
                          return {};

                        //always make sure we remove the prefix.
                        _fontFamily_ = _fontFamily_.replace('[gfont]', '').replace('[cfont]', '');

                        var module = this,
                            split = _fontFamily_.split(':'), font_family, font_weight, font_style;

                        font_family       = getFontFamilyName( _fontFamily_ );

                        font_weight       = split[1] ? split[1].replace( /[^0-9.]+/g , '') : 400; //removes all characters
                        font_weight       = _.isNumber( font_weight ) ? font_weight : 400;
                        font_style        = ( split[1] && -1 != split[1].indexOf('italic') ) ? 'italic' : '';


                        return {
                              'font-family' : 'none' == font_family ? 'inherit' : font_family.replace(/[+|:]/g, ' '),//removes special characters
                              'font-weight' : font_weight || 400,
                              'font-style'  : font_style || 'normal'
                        };
                  };

                  // @return the font family name only from a pre Google formated
                  // Example : input is Inknut+Antiqua:regular
                  // Should return Inknut Antiqua
                  var getFontFamilyName = function( rawFontFamily ) {
                        if ( ! _.isString( rawFontFamily ) || _.isEmpty( rawFontFamily ) )
                            return rawFontFamily;

                        rawFontFamily = rawFontFamily.replace('[gfont]', '').replace('[cfont]', '');
                        var split         = rawFontFamily.split(':');
                        return _.isString( split[0] ) ? split[0].replace(/[+|:]/g, ' ') : '';//replaces special characters ( + ) by space
                  };

                  $.when( _getFontCollections() ).done( function( fontCollections ) {
                        _preprocessSelect2ForFontFamily().done( function( customResultsAdapter ) {
                              _setupSelectForFontFamilySelector( customResultsAdapter, fontCollections );
                        });
                  }).fail( function( _r_ ) {
                        api.errare( 'font_picker => fail response =>', _r_ );
                  });
            }//font_picker()
      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};
      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            // FONT AWESOME ICON PICKER
            fa_icon_picker : function() {
                  var input           = this,
                      _selected_found = false;

                  //generates the options
                  var _generateOptions = function( iconCollection ) {
                        _.each( iconCollection , function( iconClass ) {
                              var _attributes = {
                                    value: iconClass,
                                    //iconClass is in the form "fa(s|b|r) fa-{$name}" so the name starts at position 7
                                    html: api.CZR_Helpers.capitalize( iconClass.substring( 7 ) )
                              };

                              if ( _attributes.value == input() ) {
                                    $.extend( _attributes, { selected : "selected" } );
                                    _selected_found = true;
                              }
                              $( 'select[data-czrtype]', input.container ).append( $('<option>', _attributes) );
                        });


                        var addIcon = function ( state ) {
                              if (! state.id) { return state.text; }

                              //two spans here because we cannot wrap the text into the icon span as the solid FA5 font-weight is bold
                              var  $state = $(
                                '<span class="' + state.element.value + '"></span><span class="social-name">&nbsp;&nbsp;' + state.text + '</span>'
                              );
                              return $state;
                        };

                        //blank option to allow placeholders
                        var $_placeholder;
                        if ( _selected_found ) {
                              $_placeholder = $('<option>');
                        } else {
                              $_placeholder = $('<option>', { selected: 'selected' } );
                        }
                        //Initialize czrSelect2
                        $( 'select[data-czrtype]', input.container )
                            .prepend( $_placeholder )
                            .czrSelect2({
                                  templateResult: addIcon,
                                  templateSelection: addIcon,
                                  placeholder: sektionsLocalizedData.i18n['Select an icon'],
                                  allowClear: true
                            });
                  };//_generateOptions


                  var _getIconsCollections = function() {
                        return $.Deferred( function( _dfd_ ) {
                              if ( ! _.isEmpty( input.sek_faIconCollection ) ) {
                                    _dfd_.resolve( input.sek_faIconCollection );
                              } else {
                                    // This utility handles a cached version of the font_list once fetched the first time
                                    // @see api.CZR_Helpers.czr_cachedTmpl
                                    api.CZR_Helpers.getModuleTmpl( {
                                          tmpl : 'icon_list',
                                          module_type: 'fa_icon_picker_input',
                                          module_id : input.module.id
                                    } ).done( function( _serverTmpl_ ) {
                                          // Ensure we have a string that's JSON.parse-able
                                          if ( typeof _serverTmpl_ !== 'string' || _serverTmpl_[0] !== '[' ) {
                                                throw new Error( 'fa_icon_picker => server list is not JSON.parse-able');
                                          }
                                          input.sek_faIconCollection = JSON.parse( _serverTmpl_ );
                                          _dfd_.resolve( input.sek_faIconCollection );
                                    }).fail( function( _r_ ) {
                                          _dfd_.reject( _r_ );
                                    });
                              }
                              //return dfd.promise();
                        });
                  };//_getIconsCollections

                  // do
                  var _do_ = function( params ) {
                        if ( true === input.iconCollectionSet )
                          return;
                        $.when( _getIconsCollections() ).done( function( iconCollection ) {
                              _generateOptions( iconCollection );
                              if ( params && true === params.open_on_init ) {
                                    // let's open select2 after a delay ( because there's no 'ready' event with select2 )
                                    _.delay( function() {
                                          try{ $( 'select[data-czrtype]', input.container ).czrSelect2('open'); }catch(er) {}
                                    }, 100 );
                              }
                        }).fail( function( _r_ ) {
                              api.errare( 'fa_icon_picker => fail response =>', _r_ );
                        });
                        input.iconCollectionSet = true;
                  };

                  // Generate options and open select2
                  input.container.on('click', function() {
                        _do_();
                  });

                  // schedule the iconCollectionSet after a delay
                  _.delay( function() { _do_( { open_on_init : false } );}, 1000 );

            }
      });//$.extend( api.czrInputMap, {})

})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            code_editor : function( input_options ) {
                  var input          = this,
                      control        = this.module.control,
                      item           = input.input_parent(),
                      editorSettings = false,
                      $textarea      = input.container.find( 'textarea' ),
                      $input_title   = input.container.find( '.customize-control-title' ),
                      editor_params  = $textarea.data( 'editor-params' );

                  // // When using blocking notifications (type: error) the following block will append a checkbox to the
                  // // notification message block that once checked will allow to save and publish anyways

                  // // Note that rendering is debounced so the props will be used when rendering happens after add event.
                  // control.notifications.bind( 'add', function( notification ) {
                  //       // Skip if control notification is not from setting csslint_error notification.
                  //       if ( notification.code !== control.setting.id + ':' + input.id ) {
                  //             return;
                  //       }

                  //       // Customize the template and behavior of csslint_error notifications.
                  //       notification.templateId = 'customize-code-editor-lint-error-notification';
                  //       notification.render = (function( render ) {
                  //             return function() {
                  //                   var li = render.call( this );
                  //                   li.find( 'input[type=checkbox]' ).on( 'click', function() {
                  //                         control.setting.notifications.remove( input.id );
                  //                   } );
                  //                   return li;
                  //             };
                  //       })( notification.render );
                  // } );

                  // Obtain editorSettings for instantiation.
                  if ( wp.codeEditor  && ( _.isUndefined( editor_params ) || false !== editor_params )  ) {
                        // Obtain this input editor settings (we don't have defaults).
                        editorSettings = editor_params;
                  }

                  input.isReady.done( function() {
                        var _doInstantiate = function( evt ) {
                              var input = this;
                              // Bail if we have an instance
                              if ( ! _.isEmpty( input.editor ) )
                                return;
                              // Bail if the control is not expanded yet
                              if ( _.isEmpty( input.module.control.container.attr('data-sek-expanded') ) || "false" == input.module.control.container.attr('data-sek-expanded') )
                                return;

                              setTimeout( function() {
                                    if ( editorSettings ) {
                                          try { initSyntaxHighlightingEditor( editorSettings ); } catch( er ) {
                                                api.errare( 'error in sek_control => code_editor() input', er );
                                                initPlainTextareaEditor();
                                          }
                                    } else {
                                          initPlainTextareaEditor();
                                    }
                                    //focus the editor
                                   $input_title.click();
                              }, 10 );
                        };
                        // Try to instantiate now
                        _doInstantiate.call(input);

                        // the input should be visible otherwise the code mirror initializes wrongly:
                        // e.g. bad ui (bad inline CSS maths), not visible content until click.
                        // When the code_editor input is rendered in an accordion control ( @see CZRSeksPrototype.scheduleModuleAccordion ), we need to defer the instantiation when the control has been expanded.
                        // fixes @see https://github.com/presscustomizr/nimble-builder/issues/176
                        input.module.control.container.on('sek-accordion-expanded', function() {
                              _doInstantiate.call( input );
                        });
                  });


                  /**
                   * Initialize syntax-highlighting editor.
                   */
                  var initSyntaxHighlightingEditor = function( codeEditorSettings ) {
                        var suspendEditorUpdate = false,
                            settings;

                        settings = _.extend( {}, codeEditorSettings, {
                              onTabNext: CZRSeksPrototype.selectNextTabbableOrFocusable( ':tabbable' ),
                              onTabPrevious: CZRSeksPrototype.selectPrevTabbableOrFocusable( ':tabbable' ),
                              onUpdateErrorNotice: onUpdateErrorNotice
                        });

                        input.editor = wp.codeEditor.initialize( $textarea, settings );


                        // Improve the editor accessibility.
                        $( input.editor.codemirror.display.lineDiv )
                              .attr({
                                    role: 'textbox',
                                    'aria-multiline': 'true',
                                    'aria-label': $input_title.html(),
                                    'aria-describedby': 'editor-keyboard-trap-help-1 editor-keyboard-trap-help-2 editor-keyboard-trap-help-3 editor-keyboard-trap-help-4'
                              });

                        // Focus the editor when clicking on its title.
                        $input_title.on( 'click', function( evt ) {
                              evt.stopPropagation();
                              input.editor.codemirror.focus();
                        });


                        /*
                         * When the CodeMirror instance changes, mirror to the textarea,
                         * where we have our "true" change event handler bound.
                         */
                        input.editor.codemirror.on( 'change', function( codemirror ) {
                              suspendEditorUpdate = true;
                              $textarea.val( codemirror.getValue() ).trigger( 'change' );
                              suspendEditorUpdate = false;
                        });

                        input.editor.codemirror.setValue( input() );

                        // Update CodeMirror when the setting is changed by another plugin.
                        /* TODO: check this */
                        input.bind( input.id + ':changed', function( value ) {
                              if ( ! suspendEditorUpdate ) {
                                    input.editor.codemirror.setValue( value );
                              }
                        });

                        // Prevent collapsing section when hitting Esc to tab out of editor.
                        input.editor.codemirror.on( 'keydown', function onKeydown( codemirror, event ) {
                              var escKeyCode = 27;
                              if ( escKeyCode === event.keyCode ) {
                                    event.stopPropagation();
                              }
                        });
                  };



                  /**
                   * Initialize plain-textarea editor when syntax highlighting is disabled.
                   */
                  var initPlainTextareaEditor = function() {
                        var textarea  = $textarea[0];
                        input.editor = textarea;//assign the editor property
                        $textarea.on( 'blur', function onBlur() {
                              $textarea.data( 'next-tab-blurs', false );
                        } );

                        $textarea.on( 'keydown', function onKeydown( event ) {
                              var selectionStart, selectionEnd, value, tabKeyCode = 9, escKeyCode = 27;

                              if ( escKeyCode === event.keyCode ) {
                                    if ( ! $textarea.data( 'next-tab-blurs' ) ) {
                                          $textarea.data( 'next-tab-blurs', true );
                                          event.stopPropagation(); // Prevent collapsing the section.
                                    }
                                    return;
                              }

                              // Short-circuit if tab key is not being pressed or if a modifier key *is* being pressed.
                              if ( tabKeyCode !== event.keyCode || event.ctrlKey || event.altKey || event.shiftKey ) {
                                    return;
                              }

                              // Prevent capturing Tab characters if Esc was pressed.
                              if ( $textarea.data( 'next-tab-blurs' ) ) {
                                    return;
                              }

                              selectionStart = textarea.selectionStart;
                              selectionEnd = textarea.selectionEnd;
                              value = textarea.value;

                              if ( selectionStart >= 0 ) {
                                    textarea.value = value.substring( 0, selectionStart ).concat( '\t', value.substring( selectionEnd ) );
                                    $textarea.selectionStart = textarea.selectionEnd = selectionStart + 1;
                              }

                              event.stopPropagation();
                              event.preventDefault();
                        });
                  },



                  /**
                   * Update error notice.
                   */
                  onUpdateErrorNotice = function( errorAnnotations ) {
                        var message;

                        control.setting.notifications.remove( input.id );
                        if ( 0 !== errorAnnotations.length ) {
                              if ( 1 === errorAnnotations.length ) {
                                    message = sektionsLocalizedData.i18n.codeEditorSingular.replace( '%d', '1' ).replace( '%s', $input_title.html() );
                              } else {
                                    message = sektionsLocalizedData.i18n.codeEditorPlural.replace( '%d', String( errorAnnotations.length ) ).replace( '%s', $input_title.html() );
                              }
                              control.setting.notifications.add( input.id, new api.Notification( input.id, {
                                    message: message,
                                    type: 'warning'
                              } ) );
                        }
                  }
            }
      });//$.extend( api.czrInputMap, {})
})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            range_simple : function( params ) {
                  var input = this,
                      $wrapper = $('.sek-range-with-unit-picker-wrapper', input.container ),
                      $numberInput = $wrapper.find( 'input[type="number"]'),
                      $rangeInput = $wrapper.find( 'input[type="range"]');

                  // synchronizes range input and number input
                  // number is the master => sets the input() val
                  $rangeInput.on('input', function( evt ) {
                        $numberInput.val( $(this).val() ).trigger('input');
                  });
                  $numberInput.on('input', function( evt ) {
                        input( $(this).val() );
                        $rangeInput.val( $(this).val() );
                  });
                  // trigger a change on init to sync the range input
                  $rangeInput.val( $numberInput.val() || 0 );
            },

      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            range_simple_device_switcher : function( params ) {
                  var input = this,
                      $wrapper = $('.sek-range-with-unit-picker-wrapper', input.container ),
                      $numberInput = $wrapper.find( 'input[type="number"]'),
                      $rangeInput = $wrapper.find( 'input[type="range"]'),
                      // dev note : value.replace(/\D+/g, '') : ''; not working because remove "." which we might use for em for example
                      _extractNumericVal = function( _rawVal ) {
                            return ( _.isEmpty( _rawVal ) || ! _.isString( _rawVal ) ) ? '16' : _rawVal.replace(/px|em|%/g,'');
                      },
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                      defaultVal = ( ! _.isEmpty( inputRegistrationParams ) && ! _.isEmpty( inputRegistrationParams.default ) ) ? inputRegistrationParams.default : {};

                  // Recursive helper
                  // return the value set for the currently previewed device if exists
                  // OR
                  // return the inherited value from the first parent device for which the value is set
                  // OR
                  // falls back on the module default
                  var getCurrentDeviceActualOrInheritedValue = function( inputValues, currentDevice ) {
                        var deviceHierarchy = [ 'mobile' , 'tablet', 'desktop' ];
                        if ( _.has( inputValues, currentDevice ) ) {
                              return inputValues[ currentDevice ];
                        } else {
                              var deviceIndex = _.findIndex( deviceHierarchy, function( _d_ ) { return currentDevice === _d_; });
                              if ( ! _.isEmpty( currentDevice ) && deviceIndex < deviceHierarchy.length ) {
                                    return getCurrentDeviceActualOrInheritedValue( inputValues, deviceHierarchy[ deviceIndex + 1 ] );
                              } else {
                                    var clonedDefault = $.extend( true, { desktop : '' }, defaultVal );
                                    return clonedDefault[ 'desktop' ];
                              }
                        }
                  };

                  // Synchronizes on init + refresh on previewed device changes
                  var syncWithPreviewedDevice = function( currentDevice ) {
                        // initialize the number input with the current input val
                        // for retro-compatibility, we must handle the case when the initial input val is a string instead of an array
                        // in this case, the string value is assigned to the desktop device.
                        var inputVal = input(), inputValues = {}, clonedDefault = $.extend( true, {}, defaultVal );
                        inputValues = clonedDefault;
                        if ( _.isObject( inputVal ) ) {
                              inputValues = $.extend( true, {}, inputVal );
                        } else if ( _.isString( inputVal ) && ! _.isEmpty( inputVal ) ) {
                              inputValues = { desktop : inputVal };
                        }
                        //inputValues = _.extend( inputValues, clonedDefault );
                        // do we have a val for the current device ?
                        var _rawVal = getCurrentDeviceActualOrInheritedValue( inputValues, currentDevice ),
                            _numberVal = _extractNumericVal( _rawVal );

                        // update the numeric val
                        $numberInput.val(  _numberVal  ).trigger('input', { previewed_device_switched : true });// We don't want to update the input()
                  };

                  // SETUP
                  // setup the device switcher
                  api.czr_sektions.maybeSetupDeviceSwitcherForInput.call( input );

                  // Append a reset button
                  // var resetButton = '<button type="button" class="button sek-reset-button sek-float-right">' + sektionsLocalizedData.i18n['Reset'] + '</button>';
                  // input.container.find('.customize-control-title').append( resetButton );

                  // SCHEDULE REACTIONS
                  // synchronizes range input and number input
                  // number is the master => sets the input() val
                  $rangeInput.on('input', function( evt ) {
                        $numberInput.val( $(this).val() ).trigger('input');
                  });

                  // Set the input val
                  $numberInput.on('input', function( evt, params ) {
                        var previewedDevice = api.previewedDevice() || 'desktop',
                            changedNumberInputVal = $(this).val(),
                            _newInputVal;

                        _newInputVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                        _newInputVal[ previewedDevice ] = $.extend( true, {}, _newInputVal[ previewedDevice ] || {} );

                        // Validates
                        if ( ( _.isString( changedNumberInputVal ) && ! _.isEmpty( changedNumberInputVal ) ) ) {
                              _newInputVal[ previewedDevice ]= changedNumberInputVal;
                        }

                        // update input if not previewed_device_switched
                        if ( _.isEmpty( params ) || ( _.isObject( params ) && true !== params.previewed_device_switched ) ) {
                              input( _newInputVal );
                        }
                        $rangeInput.val( $(this).val() );
                  });

                  // react to previewed device changes
                  // input.previewedDevice is updated in api.czr_sektions.maybeSetupDeviceSwitcherForInput()
                  input.previewedDevice.bind( function( currentDevice ) {
                        try { syncWithPreviewedDevice( currentDevice ); } catch( er ) {
                              api.errare('Error when firing syncWithPreviewedDevice for input type ' + input.type + ' for input id ' + input.id , er );
                        }
                  });

                  // // Schedule the reset of the value for the currently previewed device
                  // input.container.on( 'click', '.sek-reset-button', function( evt ) {
                  //       var _currentDevice = api.previewedDevice(),
                  //           _newVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                  //       if ( !_.isEmpty( _newVal[ _currentDevice ] ) ) {
                  //             _newVal = _.omit( _newVal, _currentDevice );
                  //             input( _newVal );
                  //             syncWithPreviewedDevice( api.previewedDevice() );
                  //       }
                  // });

                  // trigger a change on init to sync the range input
                  $rangeInput.val( $numberInput.val() || 0 );
                  try { syncWithPreviewedDevice( api.previewedDevice() ); } catch( er ) {
                        api.errare('Error when firing syncWithPreviewedDevice for input type ' + input.type + ' for input id ' + input.id , er );
                  }
            },

      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            range_with_unit_picker : function( params ) {
                  var input = this,
                  $wrapper = $('.sek-range-with-unit-picker-wrapper', input.container ),
                  $numberInput = $wrapper.find( 'input[type="number"]'),
                  $rangeInput = $wrapper.find( 'input[type="range"]'),
                  initial_unit = $wrapper.find('input[data-czrtype]').data('sek-unit'),
                  validateUnit = function( unit ) {
                        if ( ! _.contains( ['px', 'em', '%'], unit ) ) {
                              api.errare( 'error : invalid unit for input ' + input.id, unit );
                              unit = 'px';
                        }
                        return unit;
                  };
                  // initialize the unit with the value provided in the dom
                  input.css_unit = new api.Value( _.isEmpty( initial_unit ) ? 'px' : validateUnit( initial_unit ) );
                  // React to a unit change => trigger a number input change
                  input.css_unit.bind( function( to ) {
                        to = _.isEmpty( to ) ? 'px' : to;
                        $wrapper.find( 'input[type="number"]').trigger('input');
                  });

                  // synchronizes range input and number input
                  // number is the master => sets the input() val
                  $rangeInput.on('input', function( evt ) {
                        $numberInput.val( $(this).val() ).trigger('input');
                  });
                  $numberInput.on('input', function( evt ) {
                        input( $(this).val() + validateUnit( input.css_unit() ) );
                        $rangeInput.val( $(this).val() );
                  });
                  // trigger a change on init to sync the range input
                  $rangeInput.val( $numberInput.val() || 0 );

                  // Schedule unit changes on button click
                  $wrapper.on( 'click', '.sek-ui-button', function(evt) {
                        evt.preventDefault();
                        // handle the is-selected css class toggling
                        $wrapper.find('.sek-ui-button').removeClass('is-selected').attr( 'aria-pressed', false );
                        $(this).addClass('is-selected').attr( 'aria-pressed', true );
                        // update the initial unit ( not mandatory)
                        $wrapper.find('input[data-czrtype]').data('sek-unit', $(this).data('sek-unit') );
                        // set the current unit Value
                        input.css_unit( $(this).data('sek-unit') );
                  });

                  // add is-selected button on init to the relevant unit button
                  $wrapper.find( '.sek-ui-button[data-sek-unit="'+ initial_unit +'"]').addClass('is-selected').attr( 'aria-pressed', true );
            },

      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            range_with_unit_picker_device_switcher : function( params ) {
                  var input = this,
                      $wrapper = $('.sek-range-with-unit-picker-wrapper', input.container ),
                      $numberInput = $wrapper.find( 'input[type="number"]'),
                      $rangeInput = $wrapper.find( 'input[type="range"]'),
                      validateUnit = function( unit ) {
                            if ( ! _.contains( ['px', 'em', '%'], unit ) ) {
                                  api.errare( 'range_with_unit_picker_device_switcher => error : invalid unit for input ' + input.id, unit );
                                  unit = 'px';
                            }
                            return unit;
                      },
                      // dev note : value.replace(/\D+/g, '') : ''; not working because remove "." which we might use for em for example
                      _extractNumericVal = function( _rawVal ) {
                            return ( _.isEmpty( _rawVal ) || ! _.isString( _rawVal ) ) ? '16' : _rawVal.replace(/px|em|%/g,'');
                      },
                      _extractUnit = function( _rawVal ) {
                            return ( _.isEmpty( _rawVal ) || ! _.isString( _rawVal ) ) ? 'px' : _rawVal.replace(/[0-9]|\.|,/g, '');
                      },
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                      defaultVal = ( ! _.isEmpty( inputRegistrationParams ) && ! _.isEmpty( inputRegistrationParams.default ) ) ? inputRegistrationParams.default : {};

                  var getInitialUnit = function() {
                        return $wrapper.find('input[data-czrtype]').data('sek-unit') || 'px';
                  };

                  // Recursive helper
                  // return the value set for the currently previewed device if exists
                  // OR
                  // return the inherited value from the first parent device for which the value is set
                  // OR
                  // falls back on the module default
                  var getCurrentDeviceActualOrInheritedValue = function( inputValues, currentDevice ) {
                        var deviceHierarchy = [ 'mobile' , 'tablet', 'desktop' ];
                        if ( _.has( inputValues, currentDevice ) ) {
                              return inputValues[ currentDevice ];
                        } else {
                              var deviceIndex = _.findIndex( deviceHierarchy, function( _d_ ) { return currentDevice === _d_; });
                              if ( ! _.isEmpty( currentDevice ) && deviceIndex < deviceHierarchy.length ) {
                                    return getCurrentDeviceActualOrInheritedValue( inputValues, deviceHierarchy[ deviceIndex + 1 ] );
                              } else {
                                    var clonedDefault = $.extend( true, { desktop : '' }, defaultVal );
                                    return clonedDefault[ 'desktop' ];
                              }
                        }
                  };

                  // Synchronizes on init + refresh on previewed device changes
                  var syncWithPreviewedDevice = function( currentDevice ) {
                        // initialize the number input with the current input val
                        // for retro-compatibility, we must handle the case when the initial input val is a string instead of an array
                        // in this case, the string value is assigned to the desktop device.
                        var inputVal = input(), inputValues = {}, clonedDefault = $.extend( true, {}, defaultVal );
                        inputValues = clonedDefault;
                        if ( _.isObject( inputVal ) ) {
                              inputValues = $.extend( true, {}, inputVal );
                        } else if ( _.isString( inputVal ) && ! _.isEmpty( inputVal ) ) {
                              inputValues = { desktop : inputVal };
                        }
                        //inputValues = _.extend( inputValues, clonedDefault );
                        // do we have a val for the current device ?
                        var _rawVal = getCurrentDeviceActualOrInheritedValue( inputValues, currentDevice ),
                            _unit = _extractUnit( _rawVal ),
                            _numberVal = _extractNumericVal( _rawVal );

                        // update the unit
                        $('.sek-unit-wrapper', $wrapper).find('[data-sek-unit="' + _unit +'"]').trigger('click', { previewed_device_switched : true });// We don't want to update the input()
                        // add is-selected button on init to the relevant unit button
                        $wrapper.find( '.sek-ui-button[data-sek-unit="'+ _unit +'"]').addClass('is-selected').attr( 'aria-pressed', true );

                        // update the numeric val
                        $numberInput.val(  _numberVal  ).trigger('input', { previewed_device_switched : true });// We don't want to update the input()
                  };



                  // SETUP
                  // setup the device switcher
                  api.czr_sektions.maybeSetupDeviceSwitcherForInput.call( input );

                  // initialize the unit with the value provided in the dom
                  input.css_unit = new api.Value( _.isEmpty( getInitialUnit() ) ? 'px' : validateUnit( getInitialUnit() ) );

                  // Append a reset button
                  var resetButton = '<button type="button" class="button sek-reset-button sek-float-right">' + sektionsLocalizedData.i18n['Reset'] + '</button>';
                  input.container.find('.customize-control-title').append( resetButton );






                  // SCHEDULE REACTIONS
                  // React to a unit change => trigger a number input change
                  // Don't move when switching the device
                  // @param params can be { previewed_device_switched : true }
                  input.css_unit.bind( function( to, from, params ) {
                        if ( _.isObject( params ) && true === params.previewed_device_switched )
                          return;
                        $numberInput.trigger('input');
                  });

                  // synchronizes range input and number input
                  // number is the master => sets the input() val
                  $rangeInput.on('input', function( evt ) {
                        $numberInput.val( $(this).val() ).trigger('input');
                  });
                  // Set the input val
                  $numberInput.on('input', function( evt, params ) {
                        var previewedDevice = api.previewedDevice() || 'desktop',
                            changedNumberInputVal = $(this).val() + validateUnit( input.css_unit() ),
                            _newInputVal;

                        _newInputVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                        _newInputVal[ previewedDevice ] = $.extend( true, {}, _newInputVal[ previewedDevice ] || {} );

                        // Validates
                        if ( ( _.isString( changedNumberInputVal ) && ! _.isEmpty( changedNumberInputVal ) ) ) {
                              _newInputVal[ previewedDevice ]= changedNumberInputVal;
                        }

                        // update input if not previewed_device_switched
                        if ( _.isEmpty( params ) || ( _.isObject( params ) && true !== params.previewed_device_switched ) ) {
                              input( _newInputVal );
                        }
                        $rangeInput.val( $(this).val() );
                  });

                  // Schedule unit changes on button click
                  $wrapper.on( 'click', '.sek-ui-button', function( evt, params ) {
                        //evt.preventDefault();
                        evt.stopPropagation();
                        // handle the is-selected css class toggling
                        $wrapper.find('.sek-ui-button').removeClass('is-selected').attr( 'aria-pressed', false );
                        $(this).addClass('is-selected').attr( 'aria-pressed', true );
                        // update the initial unit ( not mandatory)
                        $wrapper.find('input[data-czrtype]').data('sek-unit', $(this).data('sek-unit') );
                        // set the current unit Value
                        input.css_unit( $(this).data('sek-unit'), params );
                  });

                  // react to previewed device changes
                  // input.previewedDevice is updated in api.czr_sektions.maybeSetupDeviceSwitcherForInput()
                  input.previewedDevice.bind( function( currentDevice ) {
                        try { syncWithPreviewedDevice( currentDevice ); } catch( er ) {
                              api.errare('Error when firing syncWithPreviewedDevice for input type range_with_unit_picker_device_switcher for input id ' + input.id , er );
                        }
                  });

                  // Schedule the reset of the value for the currently previewed device
                  input.container.on( 'click', '.sek-reset-button', function( evt ) {
                        var _currentDevice = api.previewedDevice(),
                            _newVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                        if ( !_.isEmpty( _newVal[ _currentDevice ] ) ) {
                              _newVal = _.omit( _newVal, _currentDevice );
                              input( _newVal );
                              syncWithPreviewedDevice( api.previewedDevice() );
                        }
                  });


                  // INITIALIZES
                  // trigger a change on init to sync the range input
                  $rangeInput.val( $numberInput.val() || 0 );
                  try { syncWithPreviewedDevice( api.previewedDevice() ); } catch( er ) {
                        api.errare('Error when firing syncWithPreviewedDevice for input type range_with_unit_picker_device_switcher for input id ' + input.id , er );
                  }
            },

      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            borders : function( params ) {
                  var input = this,
                      $wrapper = $('.sek-borders', input.container ),
                      $numberInput = $wrapper.find( 'input[type="number"]'),
                      $rangeInput = $wrapper.find( 'input[type="range"]'),
                      $colorInput = $wrapper.find('.sek-alpha-color-input'),
                      validateUnit = function( unit ) {
                            if ( ! _.contains( ['px', 'em', '%'], unit ) ) {
                                  api.errare( 'borders => error : invalid unit for input ' + input.id, unit );
                                  unit = 'px';
                            }
                            return unit;
                      },
                      // dev note : value.replace(/\D+/g, '') : ''; not working because remove "." which we might use for em for example
                      _extractNumericVal = function( _rawVal ) {
                            return ( _.isEmpty( _rawVal ) || ! _.isString( _rawVal ) ) ? '16' : _rawVal.replace(/px|em|%/g,'');
                      },
                      _extractUnit = function( _rawVal ) {
                            return ( _.isEmpty( _rawVal ) || ! _.isString( _rawVal ) ) ? 'px' : _rawVal.replace(/[0-9]|\.|,/g, '');
                      },
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                      defaultVal = ( ! _.isEmpty( inputRegistrationParams ) && ! _.isEmpty( inputRegistrationParams.default ) ) ? inputRegistrationParams.default : {};

                  input.cssBorderTypes = [ 'top', 'left', 'right', 'bottom' ];

                  // Return the unit of the _all_ border type
                  var getInitialUnit = function() {
                        var inputVal = input(), initial_unit = 'px';
                        if ( _.isObject( inputVal ) && _.has( inputVal, '_all_' ) && _.isObject( inputVal['_all_'] ) && ! _.isEmpty( inputVal['_all_'][ 'wght'] ) ) {
                              initial_unit = validateUnit( _extractUnit( inputVal['_all_'][ 'wght'] ) );
                        }
                        return initial_unit;
                  };
                  // Return the number value of the _all_ border type
                  var getInitialWeight = function() {
                        var inputVal = input(), initial_weight = 1;
                        if ( _.isObject( inputVal ) && _.has( inputVal, '_all_' ) && _.isObject( inputVal['_all_'] ) && ! _.isEmpty( inputVal['_all_'][ 'wght'] ) ) {
                              initial_weight = _extractNumericVal( inputVal['_all_'][ 'wght'] );
                        }
                        initial_weight = parseInt(initial_weight, 10);
                        if ( ! _.isNumber( initial_weight ) || initial_weight < 0 ) {
                              api.errare( 'Error in borders input type for module : ' + input.module.module_type + ' the initial border width is invalid : ' + initial_weight );
                              initial_weight = 1;
                        }
                        return initial_weight;
                  };
                  // Return the color of the _all_ border type
                  var getInitialColor = function() {
                        var inputVal = input(), initial_color = '#000000';
                        if ( _.isObject( inputVal ) && _.has( inputVal, '_all_' ) && _.isObject( inputVal['_all_'] ) && ! _.isEmpty( inputVal['_all_'][ 'col'] ) ) {
                              initial_color = inputVal['_all_'][ 'col'];
                        }
                        return initial_color;
                  };

                  // Recursive helper
                  // _all_ : { wght : 1px, col : #000000 }
                  // falls back on {}
                  var getCurrentBorderTypeOrAllValue = function( inputValues, borderType ) {
                        var clonedDefaults = $.extend( true, {}, defaultVal ), _all_Value;
                        if ( ! _.has( clonedDefaults, '_all_' ) ) {
                            throw new Error( "Error when firing getCurrentBorderTypeOrAllValue : the default value of the borders input must be php registered as an array formed : array( 'wght' => '1px', 'col' => '#000000' )");
                        }

                        _all_Value =  ( _.isObject( inputValues ) && _.has( inputValues, '_all_' ) ) ? _.extend( clonedDefaults['_all_'], inputValues[ '_all_' ] ) : clonedDefaults['_all_'];
                        if ( _.has( inputValues, borderType ) && _.isObject( inputValues[ borderType ] ) ) {
                              return _.extend( _all_Value, inputValues[ borderType ] );
                        } else {
                              return clonedDefaults['_all_'];
                        }
                  };

                  // Synchronizes on init + refresh on border type change
                  var syncWithBorderType = function( borderType ) {
                        if ( ! _.contains( _.union( input.cssBorderTypes, [ '_all_' ] ) , borderType ) ) {
                              throw new Error( "Error in syncWithBorderType : the border type must be one of those values '_all_', 'top', 'left', 'right', 'bottom'" );
                        }

                        // initialize the number input with the current input val
                        // for retro-compatibility, we must handle the case when the initial input val is a string instead of an array
                        // in this case, the string value is assigned to the desktop device.
                        var inputVal = input(), inputValues = {}, clonedDefault = $.extend( true, {}, defaultVal );
                        if ( _.isObject( inputVal ) ) {
                              inputValues = $.extend( true, {}, inputVal );
                        } else if ( _.isString( inputVal ) ) {
                              inputValues = { _all_ : { wght : inputVal } };
                        }
                        inputValues = $.extend( clonedDefault, inputValues );

                        // do we have a val for the current border type ?
                        var _rawVal = getCurrentBorderTypeOrAllValue( inputValues, borderType ), _unit, _numberVal;
                        if ( _.isEmpty( _rawVal ) || ! _.isObject( _rawVal ) || _.isEmpty( _rawVal.wght ) || _.isEmpty( _rawVal.col ) ) {
                              throw new Error( "Error in syncWithBorderType : getCurrentBorderTypeOrAllValue must return an object formed : array( 'wght' => '1px', 'col' => '#000000' )");
                        }

                        _unit = _extractUnit( _rawVal.wght );
                        _numberVal = _extractNumericVal( _rawVal.wght );

                        // update the unit
                        $('.sek-unit-wrapper', $wrapper).find('[data-sek-unit="' + _unit +'"]').trigger('click', { border_type_switched : true });// We don't want to update the input()
                        // add is-selected button on init to the relevant unit button
                        $wrapper.find( '.sek-ui-button[data-sek-unit="'+ _unit +'"]').addClass('is-selected').attr( 'aria-pressed', true );
                        // update the numeric val
                        $numberInput.val( _numberVal ).trigger('input', { border_type_switched : true });// We don't want to update the input()
                        // update the color
                        // trigger the change between "border_type_switched" data flags, so we know the api setting don't have to be refreshed
                        // ( there's no easy other way to pass a param when triggering )
                        $colorInput.data('border_type_switched', true );
                        $colorInput.val( _rawVal.col ).trigger( 'change' );
                        $colorInput.data('border_type_switched', false );
                  };





                  // SETUP
                  input.borderColor = new api.Value( _.isEmpty( getInitialColor() ) ? '#000000' : getInitialColor() );
                  // initialize the unit
                  input.css_unit = new api.Value( _.isEmpty( getInitialUnit() ) ? 'px' : validateUnit( getInitialUnit() ) );
                  // setup the border type switcher. Initialized with all.
                  input.borderType = new api.Value( '_all_');
                  // Setup the initial state of the number input
                  $numberInput.val( getInitialWeight() );
                  // Setup the color input
                  $colorInput.val( input.borderColor() );
                  $colorInput.wpColorPicker({
                        palettes: true,
                        //hide:false,
                        width: window.innerWidth >= 1440 ? 271 : 251,
                        change : function( evt, o ) {
                              //if the input val is not updated here, it's not detected right away.
                              //weird
                              //is there a "change complete" kind of event for iris ?
                              //$(this).val($(this).wpColorPicker('color'));
                              //input.container.find('[data-czrtype]').trigger('colorpickerchange');

                              //synchronizes with the original input
                              //OLD => $(this).val( $(this).wpColorPicker('color') ).trigger('colorpickerchange').trigger('change');
                              $(this).val( o.color.toString() ).trigger('colorpickerchange');
                              input.borderColor( o.color.toString(), { border_type_switched : true === $(this).data('border_type_switched') } );
                              //input.borderColor( o.color.toString() );
                              // if ( evt.originalEvent && evt.originalEvent.type && 'external' === evt.originalEvent.type ) {
                              //       input.borderColor( o.color.toString(), { border_type_switched : true } );
                              // } else {
                              //       input.borderColor( o.color.toString() );
                              // }
                        },
                        clear : function( e, o ) {
                              $(this).val('').trigger('colorpickerchange');
                              input.borderColor('');
                        }
                  });






                  // SCHEDULE REACTIONS
                  // React to a unit change => trigger a number input change
                  // Don't move when switching the border type or initializing unit
                  // @param params can be { border_type_switched : true }
                  input.css_unit.bind( function( to, from, params ) {
                        // don't update the main input when switching border types or initializing the unit value
                        if ( _.isObject( params ) && ( true === params.border_type_switched || true === params.initializing_the_unit ) )
                          return;
                        $numberInput.trigger('input', params);
                  });

                  // React to a color change => trigger a number input change
                  // Don't move when switching the border type or initializing the color
                  // @param params can be { border_type_switched : true }
                  input.borderColor.bind( function( to, from, params ) {
                        // don't update the main input when switching border types or initializing the unit value
                        if ( _.isObject( params ) && ( true === params.border_type_switched || true === params.initializing_the_color ) )
                          return;
                        $numberInput.trigger('input', params);
                  });

                  // react to border type changes
                  input.borderType.bind( function( borderType ) {
                        try { syncWithBorderType( borderType ); } catch( er ) {
                              api.errare('Error when firing syncWithBorderType for input type borders for module type ' + input.module.module_type , er );
                        }
                  });

                  // synchronizes range input and number input
                  // number is the master => sets the input() val
                  $rangeInput.on('input', function( evt ) {
                        $numberInput.val( $(this).val() ).trigger('input');
                  });

                  // Set the input val
                  $numberInput.on('input', function( evt, params ) {
                        var currentBorderType = input.borderType() || '_all_',
                            currentColor = input.borderColor(),
                            changedNumberInputVal = $(this).val() + validateUnit( input.css_unit() ),
                            clonedDefaults = $.extend( true, {}, defaultVal ),
                            _newInputVal;

                        _newInputVal = $.extend( true, {}, _.isObject( input() ) ? input() : clonedDefaults );
                        _newInputVal[ currentBorderType ] = $.extend( true, {}, _newInputVal[ currentBorderType ] || clonedDefaults[ currentBorderType ] );

                        // populate the border weight value
                        if ( ( _.isString( changedNumberInputVal ) && ! _.isEmpty( changedNumberInputVal ) ) ) {
                              _newInputVal[ currentBorderType ][ 'wght' ] = changedNumberInputVal;
                        }
                        // populate the color value
                        _newInputVal[ currentBorderType ][ 'col' ] = currentColor;

                        // update input if not border_type_switched
                        // if _all_ is changed, removed all other types
                        if ( _.isEmpty( params ) || ( _.isObject( params ) && true !== params.border_type_switched ) ) {
                              if ( '_all_' === currentBorderType ) {
                                    _.each( input.cssBorderTypes, function( _type ) {
                                          _newInputVal = _.omit( _newInputVal, _type );
                                    });
                              }
                              input( _newInputVal );
                        }
                        // refresh the range slider
                        $rangeInput.val( $(this).val() );
                  });


                  // Schedule unit changes on button click
                  $wrapper.on( 'click', '[data-sek-unit]', function( evt, params ) {
                        evt.preventDefault();
                        // handle the is-selected css class toggling
                        $wrapper.find('[data-sek-unit]').removeClass('is-selected').attr( 'aria-pressed', false );
                        $(this).addClass('is-selected').attr( 'aria-pressed', true );
                        // update the initial unit ( not mandatory)
                        $wrapper.find('input[data-czrtype]').data('sek-unit', $(this).data('sek-unit') );
                        // set the current unit Value
                        input.css_unit( $(this).data('sek-unit'), params );
                  });

                  // Schedule border type changes on button click
                  $wrapper.on( 'click', '[data-sek-border-type]', function( evt, params ) {
                        evt.preventDefault();
                        // handle the is-selected css class toggling
                        $wrapper.find('[data-sek-border-type]').removeClass('is-selected').attr( 'aria-pressed', false );
                        $(this).addClass('is-selected').attr( 'aria-pressed', true );
                        var border = '_all_';
                        try { border = $(this).data('sek-border-type'); } catch( er ) {
                              api.errare( 'borders input type => error when attaching click event', er );
                        }
                        input.borderType( border, params );
                  });

                  // Schedule the reset of the value for the currently previewed device
                  input.container.on( 'click', '.sek-reset-button', function( evt ) {
                        var currentBorderType = input.borderType() || '_all_',
                            _newVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                        if ( !_.isEmpty( _newVal[ currentBorderType ] ) ) {
                              _newVal = _.omit( _newVal, currentBorderType );
                              input( _newVal );
                              syncWithBorderType( currentBorderType );
                        }
                  });








                  // INITIALIZES
                  // trigger a change on init to sync the range input
                  $rangeInput.val( $numberInput.val() || 0 );
                  try { syncWithBorderType( input.borderType() ); } catch( er ) {
                        api.errare('Error when firing syncWithBorderType for input type borders for module type ' + input.module.module_type , er );
                  }
                  // trigger a click on the initial unit
                  // => the initial unit could be set when fetching the server template but it's more convenient to handle it once the template is rendered
                  $( '[data-sek-unit="' + input.css_unit() + '"]', $wrapper ).trigger('click', { initializing_the_unit : true } );
            },

      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            border_radius : function( params ) {
                  var input = this,
                      $wrapper = $('.sek-borders', input.container ),
                      $numberInput = $wrapper.find( 'input[type="number"]'),
                      $rangeInput = $wrapper.find( 'input[type="range"]'),
                      validateUnit = function( unit ) {
                            if ( ! _.contains( ['px', 'em', '%'], unit ) ) {
                                  api.errare( 'border_radius => error : invalid unit for input ' + input.id, unit );
                                  unit = 'px';
                            }
                            return unit;
                      },
                      // dev note : value.replace(/\D+/g, '') : ''; not working because remove "." which we might use for em for example
                      _extractNumericVal = function( _rawVal ) {
                            return ( _.isEmpty( _rawVal ) || ! _.isString( _rawVal ) ) ? '16' : _rawVal.replace(/px|em|%/g,'');
                      },
                      _extractUnit = function( _rawVal ) {
                            return ( _.isEmpty( _rawVal ) || ! _.isString( _rawVal ) ) ? 'px' : _rawVal.replace(/[0-9]|\.|,/g, '');
                      },
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                      defaultVal = ( ! _.isEmpty( inputRegistrationParams ) && ! _.isEmpty( inputRegistrationParams.default ) ) ? inputRegistrationParams.default : {};

                  input.cssRadiusTypes = [ 'top_left','top_right','bottom_right','bottom_left' ];

                  // Return the unit of the _all_ border type
                  var getInitialUnit = function() {
                        var inputVal = input(), initial_unit = 'px';
                        if ( _.isObject( inputVal ) && _.has( inputVal, '_all_' ) ) {
                              initial_unit = validateUnit( _extractUnit( inputVal['_all_'] ) );
                        }
                        return initial_unit;
                  };
                  // Return the number value of the _all_ border type
                  var getInitialRadius = function() {
                        var inputVal = input(), initial_rad = 0;
                        if ( _.isObject( inputVal ) && _.has( inputVal, '_all_' ) ) {
                              initial_rad = _extractNumericVal( inputVal['_all_'] );
                        }
                        initial_rad = parseInt(initial_rad, 10);
                        if ( ! _.isNumber( initial_rad ) || initial_rad < 0 ) {
                              api.errare( 'Error in border_radius input type for module : ' + input.module.module_type + ' the initial radius is invalid : ' + initial_rad );
                              initial_rad = 0;
                        }
                        return initial_rad;
                  };


                  // Recursive helper
                  // _all_ : 3px
                  // falls back on {}
                  var getCurrentRadiusTypeOrAllValue = function( inputValues, radiusType ) {
                        var clonedDefaults = $.extend( true, {}, defaultVal ), _all_Value;
                        if ( ! _.has( clonedDefaults, '_all_' ) ) {
                            throw new Error( "Error when firing getCurrentRadiusTypeOrAllValue : the default value of the border_radius input must be php registered as an array");
                        }

                        _all_Value =  ( _.isObject( inputValues ) && _.has( inputValues, '_all_' ) ) ? inputValues[ '_all_' ] : clonedDefaults['_all_'];
                        if ( _.has( inputValues, radiusType ) ) {
                              return inputValues[ radiusType ];
                        } else {
                              return _all_Value;
                        }
                  };

                  // Synchronizes on init + refresh on border radius change
                  var syncWithRadiusType = function( radiusType ) {
                        if ( ! _.contains( [ '_all_', 'top_left', 'top_right', 'bottom_right', 'bottom_left' ], radiusType ) ) {
                              throw new Error( "Error in syncWithRadiusType : the radius type must be one of those values '_all_', 'top_left', 'top_right', 'bottom_right', 'bottom_left', => radius type => " + radiusType );
                        }

                        // initialize the number input with the current input val
                        // for retro-compatibility, we must handle the case when the initial input val is a string instead of an array
                        // in this case, the string value is assigned to the desktop device.
                        var inputVal = input(), inputValues = {}, clonedDefault = $.extend( true, {}, defaultVal );
                        if ( _.isObject( inputVal ) ) {
                              inputValues = $.extend( true, {}, inputVal );
                        } else if ( _.isString( inputVal ) ) {
                              inputValues = { _all_ : '0px' };
                        }
                        inputValues = $.extend( clonedDefault, inputValues );

                        // do we have a val for the current type ?
                        var _rawVal = getCurrentRadiusTypeOrAllValue( inputValues, radiusType ), _unit, _numberVal;
                        if ( _.isEmpty( _rawVal ) || ! _.isString( _rawVal ) ) {
                              throw new Error( "Error in syncWithRadiusType : getCurrentRadiusTypeOrAllValue must return a string like 3em");
                        }

                        _unit = _extractUnit( _rawVal );
                        _numberVal = _extractNumericVal( _rawVal );

                        // update the unit
                        $('.sek-unit-wrapper', $wrapper).find('[data-sek-unit="' + _unit +'"]').trigger('click', { radius_type_switched : true });// We don't want to update the input()
                        // add is-selected button on init to the relevant unit button
                        $wrapper.find( '.sek-ui-button[data-sek-unit="'+ _unit +'"]').addClass('is-selected').attr( 'aria-pressed', true );
                        // update the numeric val
                        $numberInput.val( _numberVal ).trigger('input', { radius_type_switched : true });// We don't want to update the input()
                  };







                  // SETUP
                  // initialize the unit
                  input.css_unit = new api.Value( _.isEmpty( getInitialUnit() ) ? 'px' : validateUnit( getInitialUnit() ) );
                  // setup the border type switcher. Initialized with all.
                  input.radiusType = new api.Value('_all_');
                  // Setup the initial state of the number input
                  $numberInput.val( getInitialRadius() );








                  // SCHEDULE REACTIONS
                  // React to a unit change => trigger a number input change
                  // Don't move when switching the border type or initializing unit
                  // @param params can be { radius_type_switched : true }
                  input.css_unit.bind( function( to, from, params ) {
                        // don't update the main input when switching border types or initializing the unit value
                        if ( _.isObject( params ) && ( true === params.radius_type_switched || true === params.initializing_the_unit ) )
                          return;
                        $numberInput.trigger('input', params);
                  });

                  // react to border type changes
                  input.radiusType.bind( function( radiusType ) {
                        try { syncWithRadiusType( radiusType ); } catch( er ) {
                              api.errare('Error when firing syncWithRadiusType for input type border_radius for module type ' + input.module.module_type , er );
                        }
                  });

                  // synchronizes range input and number input
                  // number is the master => sets the input() val
                  $rangeInput.on('input', function( evt ) {
                        $numberInput.val( $(this).val() ).trigger('input');
                  });

                  // Set the input val
                  $numberInput.on('input', function( evt, params ) {
                        var currentRadiusType = input.radiusType() || '_all_',
                            changedNumberInputVal = $(this).val() + validateUnit( input.css_unit() ),
                            clonedDefaults = $.extend( true, {}, defaultVal ),
                            _newInputVal;

                        _newInputVal = $.extend( true, {}, _.isObject( input() ) ? input() : clonedDefaults );
                        _newInputVal[ currentRadiusType ] = $.extend( true, {}, _newInputVal[ currentRadiusType ] || clonedDefaults[ currentRadiusType ] );

                        // populate the border weight value
                        if ( ( _.isString( changedNumberInputVal ) && ! _.isEmpty( changedNumberInputVal ) ) ) {
                              _newInputVal[ currentRadiusType ] = changedNumberInputVal;
                        }
                        // update input if not radius_type_switched
                        // if _all_ is changed, removed all other types
                        if ( _.isEmpty( params ) || ( _.isObject( params ) && true !== params.radius_type_switched ) ) {
                              if ( '_all_' === currentRadiusType ) {
                                    _.each( input.cssRadiusTypes, function( _type ) {
                                          _newInputVal = _.omit( _newInputVal, _type );
                                    });
                              }
                              input( _newInputVal );
                        }
                        // refresh the range slider
                        $rangeInput.val( $(this).val() );
                  });


                  // Schedule unit changes on button click
                  $wrapper.on( 'click', '[data-sek-unit]', function( evt, params ) {
                        evt.preventDefault();
                        // handle the is-selected css class toggling
                        $wrapper.find('[data-sek-unit]').removeClass('is-selected').attr( 'aria-pressed', false );
                        $(this).addClass('is-selected').attr( 'aria-pressed', true );
                        // update the initial unit ( not mandatory)
                        $wrapper.find('input[data-czrtype]').data('sek-unit', $(this).data('sek-unit') );
                        // set the current unit Value
                        input.css_unit( $(this).data('sek-unit'), params );
                  });

                  // Schedule border type changes on button click
                  $wrapper.on( 'click', '[data-sek-radius-type]', function( evt, params ) {
                        evt.preventDefault();
                        // handle the is-selected css class toggling
                        $wrapper.find('[data-sek-radius-type]').removeClass('is-selected').attr( 'aria-pressed', false );
                        $(this).addClass('is-selected').attr( 'aria-pressed', true );
                        var border = '_all_';
                        try { border = $(this).data('sek-radius-type'); } catch( er ) {
                              api.errare( 'border_radius input type => error when attaching click event', er );
                        }
                        input.radiusType( border, params );
                  });

                  // Schedule the reset of the value for the currently previewed device
                  input.container.on( 'click', '.sek-reset-button', function( evt ) {
                        var currentRadiusType = input.radiusType() || '_all_',
                            _newVal = $.extend( true, {}, _.isObject( input() ) ? input() : {} );
                        if ( !_.isEmpty( _newVal[ currentRadiusType ] ) ) {
                              _newVal = _.omit( _newVal, currentRadiusType );
                              input( _newVal );
                              syncWithRadiusType( currentRadiusType );
                        }
                  });








                  // INITIALIZES
                  // trigger a change on init to sync the range input
                  $rangeInput.val( $numberInput.val() || 0 );
                  try { syncWithRadiusType( input.radiusType() ); } catch( er ) {
                        api.errare('Error when firing syncWithRadiusType for input type border_radius for module type ' + input.module.module_type , er );
                  }
                  // trigger a click on the initial unit
                  // => the initial unit could be set when fetching the server template but it's more convenient to handle it once the template is rendered
                  $( '[data-sek-unit="' + input.css_unit() + '"]', $wrapper ).trigger('click', { initializing_the_unit : true } );
            },

      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            buttons_choice : function( params ) {
                  var input = this,
                      $wrapper = $('.sek-button-choice-wrapper', input.container ),
                      $mainInput = $wrapper.find( 'input[type="number"]'),
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                      defaultVal = ( ! _.isEmpty( inputRegistrationParams ) && ! _.isEmpty( inputRegistrationParams.default ) ) ? inputRegistrationParams.default : {};

                  // SETUP
                  // Setup the initial state of the number input
                  $mainInput.val( input() );

                  // Schedule choice changes on button click
                  $wrapper.on( 'click', '[data-sek-choice]', function( evt, params ) {
                        evt.stopPropagation();
                        // handle the is-selected css class toggling
                        $wrapper.find('[data-sek-choice]').removeClass('is-selected').attr( 'aria-pressed', false );
                        $(this).addClass('is-selected').attr( 'aria-pressed', true );
                        var newChoice;
                        try { newChoice = $(this).data('sek-choice'); } catch( er ) {
                              api.errare( 'buttons_choice input type => error when attaching click event', er );
                        }
                        input( newChoice );
                  });


                  // INITIALIZES
                  // trigger a click on the initial unit
                  // => the initial unit could be set when fetching the server template but it's more convenient to handle it once the template is rendered
                  $( '[data-sek-choice="' + input() + '"]', $wrapper ).trigger('click', { initializing_the_unit : true } );
            }
      });//$.extend( api.czrInputMap, {})
})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            reset_button : function( params ) {
                  var input = this;

                  // Schedule choice changes on button click
                  input.container.on( 'click', '[data-sek-reset-scope]', function( evt, params ) {
                        evt.stopPropagation();
                        var scope = $(this).data( 'sek-reset-scope' );

                        if ( _.isEmpty( scope ) || !_.contains(['local', 'global'], scope ) ) {
                              api.errare( 'reset_button input => invalid scope provided.', scope );
                              return;
                        }
                        api.czr_sektions.updateAPISetting({
                              action : 'sek-reset-collection',
                              scope : scope,//<= will determine which setting will be updated,
                              // => self.getGlobalSectionsSettingId() or self.localSectionsSettingId()
                        }).fail( function( response ) {
                              api.errare( 'reset_button input => error when firing ::updateAPISetting', response );
                              api.previewer.trigger('sek-notify', {
                                    notif_id : 'reset-failed',
                                    type : 'error',
                                    duration : 8000,
                                    message : [
                                          '<span>',
                                            '<strong>',
                                            sektionsLocalizedData.i18n['Reset failed'],
                                            '<br/>',
                                            '<i>' + response + '</i>',
                                            '</strong>',
                                          '</span>'
                                    ].join('')
                              });
                        });
                  });//on('click')
            }
      });//$.extend( api.czrInputMap, {})
})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // the input id determine if we fetch the revision history of the local or global setting
      $.extend( api.czrInputMap, {
            revision_history : function( params ) {
                  var input = this;
                  _selected_found = false;
                  //generates the options
                  var _generateOptions = function( revisionHistory ) {
                        if ( input.container.find('.sek-revision-history').length > 0 )
                          return;
                        if ( _.isEmpty( revisionHistory ) ) {
                              input.container.append( [ '<i>', sektionsLocalizedData.i18n['No revision history available for the moment.'], '</i>' ].join('') );
                              return;
                        }
                        input.container.append( $('<select/>', {
                              class : 'sek-revision-history',
                              html : [ '<option value="_select_">', ' -', sektionsLocalizedData.i18n['Select'], '- ', '</option>'].join('')
                        }));

                        // The revisions are listed by ascending date
                        // => let's reverse the order so that we see the latest first
                        var optionsNodes = [];
                        _.each( revisionHistory , function( _date, _post_id ) {
                              var _attributes = {
                                    value: _post_id,
                                    html: _date
                              };

                              if ( _attributes.value == input() ) {
                                    $.extend( _attributes, { selected : "selected" } );
                                    _selected_found = true;
                              }
                              optionsNodes.unshift( $('<option>', _attributes) );
                        });

                        // Add the 'published' note to the first node
                        optionsNodes[0].html( [ optionsNodes[0].html(), sektionsLocalizedData.i18n['(currently published version)'] ].join(' ') );
                        _.each( optionsNodes, function( nod ) {
                              $( 'select.sek-revision-history', input.container ).append( nod );
                        });

                        // Initialize selecter
                        $( 'select.sek-revision-history', input.container ).selecter();
                  };//_generateOptions


                  var _getRevisionHistory = function() {
                        return $.Deferred( function( _dfd_ ) {
                              if ( ! _.isEmpty( input.sek_revisionHistory ) ) {
                                    _dfd_.resolve( input.sek_revisionHistory );
                              } else {
                                    // The revision history sent by the server is an object
                                    // {
                                    //  post_id : date,
                                    //  post_id : date,
                                    //  ...
                                    // }
                                    api.czr_sektions.getRevisionHistory( { is_local : 'local_revisions' === input.id } ).done( function( revisionHistory ) {
                                          // Ensure we have a string that's JSON.parse-able
                                          if ( !_.isObject(revisionHistory) ) {
                                                throw new Error( '_getRevisionHistory => server list is not a object');
                                          }
                                          input.sek_revisionHistory = revisionHistory;
                                          _dfd_.resolve( input.sek_revisionHistory );
                                    }).fail( function( _r_ ) {
                                          _dfd_.reject( _r_ );
                                    });
                              }
                              //return dfd.promise();
                        });
                  };//_getRevisionHistory

                  // do
                  var _do_ = function( params ) {
                        if ( true === input.revisionHistorySet )
                          return;
                        $.when( _getRevisionHistory() ).done( function( revisionHistory ) {
                              _generateOptions( revisionHistory );
                              if ( params && true === params.open_on_init ) {
                                    // let's open select2 after a delay ( because there's no 'ready' event with select2 )
                                    _.delay( function() {
                                          try{ $( 'select[data-czrtype]', input.container ).czrSelect2('open'); }catch(er) {}
                                    }, 100 );
                              }
                        }).fail( function( _r_ ) {
                              api.errare( '_getRevisionHistory => fail response =>', _r_ );
                        });
                        input.revisionHistorySet = true;
                  };

                  // Generate options and open select2
                  input.container.on('change', '.sek-revision-history', function() {
                        var _val = $(this).val();
                        if ( '_select_' !== _val ) {
                              api.czr_sektions.setSingleRevision( { revision_post_id : _val, is_local : 'local_revisions' === input.id } );
                        }
                  });

                  // schedule the revisionHistorySet after a delay
                  _.delay( function() { _do_( { open_on_init : false } );}, 1000 );

            }//revision_history
      });//$.extend( api.czrInputMap, {})
})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            nimble_tinymce_editor : function() {
                  var input = this,
                      $textarea = input.container.find('textarea').first(),
                      _id = $textarea.length > 0 ? $textarea.attr('id') : null,
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                      // see how those buttons can be set in php class _NIMBLE_Editors
                      // @see the global js var nimbleTinyMCEPreInit includes all params
                      defaultToolbarBtns = sektionsLocalizedData.defaultToolbarBtns,
                      //defaultQuickTagBtns = "strong,em,link,block,del,ins,img,ul,ol,li,code,more,close",
                      defaultQuickTagBtns = "strong,em,link,code";

                  if ( _.isNull( _id ) ) {
                        throw new Error( 'setupTinyMceEditor => missing textarea for module :' + input.module.id );
                  }
                  if ( tinyMCE.get( _id ) ) {
                        throw new Error( 'setupTinyMceEditor => duplicate editor id.');
                  }
                  var getToolbarBtns = function() {
                        var toolBarBtn = defaultToolbarBtns.split(',');
                        if ( inputRegistrationParams.editor_params && _.isArray( inputRegistrationParams.editor_params.excludedBtns ) ) {
                            var excluded = inputRegistrationParams.editor_params.excludedBtns;
                            toolBarBtn = _.filter( toolBarBtn, function( _btn ) {
                                  return !_.contains( excluded, _btn );
                            });
                        }
                        if ( inputRegistrationParams.editor_params && _.isString( inputRegistrationParams.editor_params.includedBtns ) ) {
                            var includedBtns = inputRegistrationParams.editor_params.includedBtns;
                            // 'basic_btns' or 'basic_btns_nolink'
                            if ( _.isEmpty( includedBtns ) || !_.isArray( sektionsLocalizedData[includedBtns] ) ) {
                                  api.errare('nimble_tinymce_editor input => invalid set of buttons provided', includedBtns );
                            } else {
                                  includedBtns = sektionsLocalizedData[includedBtns];
                                  toolBarBtn = _.filter( toolBarBtn, function( _btn ) {
                                        return _.contains( includedBtns, _btn );
                                  });
                            }
                        }
                        return toolBarBtn.join(',');
                  };
                  var getEditorHeight = function() {
                        return ( inputRegistrationParams.editor_params && _.isNumber( inputRegistrationParams.editor_params.height ) ) ? inputRegistrationParams.editor_params.height : api.czr_sektions.TINYMCE_EDITOR_HEIGHT;
                  };
                  var isAutoPEnabled = function() {
                        // on registration, the autop can be specified
                        return inputRegistrationParams && inputRegistrationParams.editor_params && true === inputRegistrationParams.editor_params.autop;
                  };
                  // Set a height for the textarea before instanciation
                  //$textarea.css( { 'height' : getEditorHeight() } );

                  // the plugins like colorpicker have been loaded when instantiating the detached tinymce editor
                  // @see php class _NIMBLE_Editors
                  // if not specified, wp.editor falls back on the ones of wp.editor.getDefaultSettings()
                  // we can use them here without the need to specify them in the tinymce {} params
                  // @see the tinyMCE params with this global var : nimbleTinyMCEPreInit.mceInit["czr-customize-content_editor"]
                  //
                  // forced_root_block added to remove <p> tags automatically added
                  // @see https://stackoverflow.com/questions/20464028/how-to-remove-unwanted-p-tags-from-wordpress-editor-using-tinymce
                  var init_settings = {
                        //tinymce: nimbleTinyMCEPreInit.mceInit["czr-customize-content_editor"],
                        tinymce: {
                            //plugins:"charmap,colorpicker,hr,lists,media,paste,tabfocus,textcolor,wordpress,wpeditimage,wpemoji,wpgallery,wplink,wpdialogs,wptextpattern,wpview",
                            toolbar1:getToolbarBtns(),
                            //toolbar2:"",
                            content_css:( function() {
                                  var default_settings = wp.editor.getDefaultSettings(),
                                      stylesheets = [ sektionsLocalizedData.tinyMceNimbleEditorStylesheetUrl ];
                                  if ( default_settings && default_settings.tinymce && default_settings.tinymce.content_css ) {
                                        stylesheets = _.union( default_settings.tinymce.content_css.split(','), stylesheets );
                                  }
                                  return stylesheets.join(',');
                            })(),
                            // https://www.tiny.cloud/docs/plugins/autoresize/
                            min_height :40,
                            height:getEditorHeight()
                        },
                        quicktags : {
                            buttons : defaultQuickTagBtns
                        },
                        mediaButtons: ( inputRegistrationParams.editor_params && false === inputRegistrationParams.editor_params.media_button ) ? false : true
                  };

                  // AUTOP
                  init_settings.tinymce.wpautop = isAutoPEnabled();
                  // forced_root_block is added to remove <p> tags automatically added
                  // @see https://stackoverflow.com/questions/20464028/how-to-remove-unwanted-p-tags-from-wordpress-editor-using-tinymce
                  if ( !isAutoPEnabled() ) {
                        init_settings.tinymce.forced_root_block = "";
                  }

                  // INITIALIZE
                  wp.editor.initialize( _id, init_settings );
                  // Note that an easy way to instantiate a basic editor would be to use :
                  // wp.editor.initialize( _id, { tinymce : { forced_root_block : "", wpautop: false }, quicktags : true });

                  var _editor = tinyMCE.get( _id );
                  if ( ! _editor ) {
                        throw new Error( 'setupTinyMceEditor => missing editor instance for module :' + input.module.id );
                  }

                  // Store the id of each instantiated tinyMceEditor
                  // used in api.czrSektion::cleanRegistered
                  api.czrActiveWPEditors = api.czrActiveWPEditors || [];
                  var currentEditors = $.extend( true, [], api.czrActiveWPEditors );
                  currentEditors.push(_id);
                  api.czrActiveWPEditors = currentEditors;

                  // Let's set the input() value when the editor is ready
                  // Because when we instantiate it, the textarea might not reflect the input value because too early
                  var _doOnInit = function() {
                        _editor.setContent( input() );
                        //$('#wp-' + _editor.id + '-wrap' ).find('iframe').addClass('labite').css('height','50px');
                  };
                  if ( _editor.initialized ) {
                        _doOnInit();
                  } else {
                        _editor.on( 'init',_doOnInit );
                  }

                  // bind events
                  _editor.on( 'input change keyup', function( evt ) {
                        input( _editor.getContent() );
                  } );
            },




            // this input setup works in collaboration with ::setupTinyMceEditor()
            // for api.sekEditorExpanded() and resizing of the editor.
            detached_tinymce_editor : function() {
                  var input = this,
                      $textarea = $('textarea#' + sektionsLocalizedData.idOfDetachedTinyMceTextArea ), //$('textarea#czr-customize-content_editor'),
                      _id,
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type );

                  if ( $textarea.length > 0  ) {
                        _id = $textarea.attr('id');
                  } else {
                        throw new Error( 'api.czrInputMap::detached_tinymce_editor => missing textarea element');
                  }

                  // if ( _.isNull( _id ) ) {
                  //       throw new Error( 'setupDetachedTinyMceEditor => missing textarea for module :' + input.module.id );
                  // }
                  // See wp.editor.initialize() in wp-admin/js/editor.js for initialization options.
                   // **
                   // * Initialize TinyMCE and/or Quicktags. For use with wp_enqueue_editor() (PHP).
                   // *
                   // * Intended for use with an existing textarea that will become the Text editor tab.
                   // * The editor width will be the width of the textarea container, height will be adjustable.
                   // *
                   // * Settings for both TinyMCE and Quicktags can be passed on initialization, and are "filtered"
                   // * with custom jQuery events on the document element, wp-before-tinymce-init and wp-before-quicktags-init.
                   // *
                   // * @since 4.8.0
                   // *
                   // * @param {string} id The HTML id of the textarea that is used for the editor.
                   // *                    Has to be jQuery compliant. No brackets, special chars, etc.
                   // * @param {object} settings Example:
                   // * settings = {
                   // *    // See https://www.tinymce.com/docs/configure/integration-and-setup/.
                   // *    // Alternatively set to `true` to use the defaults.
                   // *    tinymce: {
                   // *        setup: function( editor ) {
                   // *            console.log( 'Editor initialized', editor );
                   // *        }
                   // *    }
                   // *
                   // *    // Alternatively set to `true` to use the defaults.
                   // *    quicktags: {
                   // *        buttons: 'strong,em,link'
                   // *    }
                   // * }
                   // */

                  // Remove now
                  // the initial instance has been created with php inline js generated by sek_setup_nimble_editor()
                  // IMPORTANT !! => don't use wp.editor.remove() @see wp-admin/js/editor.js, because it can remove the stylesheet editor.css
                  // and break the style of all editors
                  if ( window.tinymce ) {
                        mceInstance = window.tinymce.get( _id );
                        if ( mceInstance ) {
                          // if ( ! mceInstance.isHidden() ) {
                          //   mceInstance.save();
                          // }
                          mceInstance.remove();
                        }
                  }
                  // if ( window.quicktags ) {
                  //   qtInstance = window.QTags.getInstance( id );

                  //   if ( qtInstance ) {
                  //     qtInstance.remove();
                  //   }
                  // }

                  // Instantiate a new one
                  // see in wp-admin/js/editor.js
                  // the nimbleTinyMCEPreInit are set in php class _NIMBLE_Editors
                  if ( !window.nimbleTinyMCEPreInit || !window.nimbleTinyMCEPreInit.mceInit || !window.nimbleTinyMCEPreInit.mceInit[ _id ] ) {
                        throw new Error('setupDetachedTinyMceEditor => invalid nimbleTinyMCEPreInit global var');
                  }

                  var init_settings = nimbleTinyMCEPreInit.mceInit[ _id ];

                  // Add the nimble editor's stylesheet to the default's ones
                  init_settings.content_css = ( function() {
                        var default_settings = wp.editor.getDefaultSettings(),
                            stylesheets = [ sektionsLocalizedData.tinyMceNimbleEditorStylesheetUrl ];
                        if ( default_settings && default_settings.tinymce && default_settings.tinymce.content_css ) {
                              stylesheets = _.union( default_settings.tinymce.content_css.split(','), stylesheets );
                        }
                        return stylesheets.join(',');
                  })();

                  // Handle wpautop param
                  var item = input.input_parent;
                  var isAutoPEnabled = function() {
                        var parent_item_val = item();
                        // 1) the module 'czr_tinymce_child' includes an autop option
                        // 2) on registration, the autop can be specified
                        if ( !_.isUndefined( parent_item_val.autop ) ) {
                            return parent_item_val.autop;
                        } else {
                            return inputRegistrationParams && inputRegistrationParams.editor_params && true === inputRegistrationParams.editor_params.autop;
                        }
                  };

                  init_settings.wpautop = isAutoPEnabled();
                  // forced_root_block is added to remove <p> tags automatically added
                  // @see https://stackoverflow.com/questions/20464028/how-to-remove-unwanted-p-tags-from-wordpress-editor-using-tinymce
                  if ( !isAutoPEnabled() ) {
                        init_settings.forced_root_block = "";
                  }

                  // TOOLBARS
                  init_settings.toolbar1 = sektionsLocalizedData.defaultToolbarBtns;
                  init_settings.toolbar2 = "";

                  window.tinymce.init( init_settings );
                  window.QTags.getInstance( _id );
                  // wp.editor.initialize( _id, {
                  //       //tinymce : true,
                  //       tinymce: nimbleTinyMCEPreInit.mceInit[_id],
                  //       quicktags : nimbleTinyMCEPreInit.qtInit[_id],
                  //       mediaButtons: true
                  // });

                  var _editor = tinyMCE.get( _id );
                  if ( ! _editor ) {
                        throw new Error( 'setupDetachedTinyMceEditor => missing editor instance for module :' + input.module.id );
                  }

                  // Let's set the input() value when the editor is ready
                  // Because when we instantiate it, the textarea might not reflect the input value because too early
                  var _doOnInit = function() {
                        // To ensure retro-compat with content created prior to Nimble v1.5.2, in which the editor has been updated
                        // @see https://github.com/presscustomizr/nimble-builder/issues/404
                        // we add the <p> tag on init, if autop option is checked
                        var initial_content = !isAutoPEnabled() ? input() : wp.editor.autop( input() );
                        _editor.setContent( initial_content );
                        api.sekEditorExpanded( true );
                        // trigger a resize to adjust height on init https://github.com/presscustomizr/nimble-builder/issues/409
                        $(window).trigger('resize');
                  };
                  if ( _editor.initialized ) {
                        _doOnInit();
                  } else {
                        _editor.on( 'init', _doOnInit );
                  }

                  // bind events
                  _editor.on( 'input change keyup keydown click SetContent BeforeSetContent', function( evt ) {
                        //$textarea.trigger( 'change', {current_input : input} );
                        input( isAutoPEnabled() ? _editor.getContent() : wp.editor.removep( _editor.getContent() ) );
                  });

                  // store the current input now, so we'll always get the right one when textarea changes
                  api.sekCurrentDetachedTinyMceInput = input;

                  // TEXT EDITOR => This is the original textarea element => needs to be bound separatelyn because not considered part of the tinyMce editor.
                  // Bound only once
                  if ( !$textarea.data('czr-bound-for-detached-editor') ) {
                        $textarea.on( 'input', function( evt, params ) {
                              api.sekCurrentDetachedTinyMceInput( $(this).val() );
                        });
                        $textarea.data('czr-bound-for-detached-editor', true );
                  }

            },//setupDetachedTinyMceEditor
      });//$.extend( api.czrInputMap, {})
})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            import_export : function() {
                  var input = this,
                      $pre_import_button = input.container.find('button[data-czr-action="sek-pre-import"]'),
                      $file_input = input.container.find('input[name=sek-import-file]'),
                      inputRegistrationParams = api.czr_sektions.getInputRegistrationParams( input.id, input.module.module_type ),
                      currentSetId = 'local' === inputRegistrationParams.scope ? api.czr_sektions.localSectionsSettingId() : api.czr_sektions.getGlobalSectionsSettingId();

                  // Add event listener to set the button state
                  $file_input.on('change', function( evt ) {
                        $pre_import_button.toggleClass( 'disabled', _.isEmpty( $(this).val() ) );
                  });

                  // @return boolean
                  var customizeChangesetIncludesNimbleDirties = function() {
                        var hasNimbleDirties = false,
                            _dirties = wp.customize.dirtyValues();

                        if ( ! _.isEmpty( _dirties ) ) {
                              _.each( _dirties, function( _val, _setId ) {
                                    if ( hasNimbleDirties )
                                      return;
                                    // we're after setting id like
                                    // - nimble___[skp__post_post_1] <= local skope setting
                                    // - __nimble__4234ae1dc0fa__font_settings <= level setting
                                    // - __nimble_options__ <= global options
                                    // - __nimble__skp__post_post_1__localSkopeOptions__template <= local option setting
                                    hasNimbleDirties = -1 !== _setId.indexOf('nimble');
                              });
                        }
                        return hasNimbleDirties;
                  };

                  // Schedule action on button click
                  input.container.on( 'click', '[data-czr-action]', function( evt ) {
                        evt.stopPropagation();
                        var _action = $(this).data( 'czr-action' );
                        switch( _action ) {
                              case 'sek-export' :
                                    // prevent exporting if the customize changeset is dirty
                                    // => because the PHP sek_catch_export_action() doesn't have access to the customize changeset and needs the one persisted in DB
                                    if ( customizeChangesetIncludesNimbleDirties() ) {
                                          alert(sektionsLocalizedData.i18n['You need to publish before exporting.']);
                                          break;
                                    }
                                    // Is there something to export ?
                                    var currentVal = api( currentSetId )(),
                                        hasNoSections = true;
                                    _.each( currentVal.collection, function( locationData ){
                                          if ( !hasNoSections )
                                            return;
                                          if ( !_.isEmpty( locationData.collection ) ) {
                                              hasNoSections = false;
                                          }
                                    });
                                    if ( hasNoSections ) {
                                          alert(sektionsLocalizedData.i18n['Nothing to export.']);
                                          break;
                                    }
                                    _export();
                              break;//'sek-export'

                              case 'sek-pre-import' :
                                    // Can we import ?
                                    // => the current page must have at least one active location
                                    if( _.isEmpty( api.czr_sektions.activeLocations() ) ) {
                                          alert(sektionsLocalizedData.i18n['The current page has no available locations to import Nimble Builder sections.']);
                                          break;
                                    }

                                    // Before actually importing, let's do a preliminary
                                    _import( { pre_import_check : true } )
                                          .done( _pre_import_checks )
                                          .fail( function( error_resp ) {
                                                api.errare( 'sek_pre_import_checks failed', error_resp );
                                                _doAlwaysAfterImportApiSettingUpdate();
                                                _import();
                                          });
                              break;//'sek-import'
                              case 'sek-import-as-is' :
                                    _import();
                              break;
                              case 'sek-import-assign' :
                                    _import( { assign_missing_locations : true } );
                              break;
                              case 'sek-cancel-import' :
                                    _doAlwaysAfterImportApiSettingUpdate();
                              break;
                        }//switch
                  });//input.container.on( 'click' .. )


                  ////////////////////////////////////////////////////////
                  // PRE-IMPORT
                  ////////////////////////////////////////////////////////
                  // Compare current active locations with the imported ones
                  // if some imported locations are not rendered in the current context, reveal the import dialog
                  // before comparing locations, purge the collection of imported location from header and footer if any
                  // "nimble_local_header", "nimble_local_footer"
                  var _pre_import_checks = function( server_resp ) {
                        var currentActiveLocations = api.czr_sektions.activeLocations(),
                            importedActiveLocations = $.extend( true, [], _.isArray( server_resp.data.metas.active_locations ) ? server_resp.data.metas.active_locations : [] );

                        // filter to remove local header and footer before comparison with current active locations
                        importedActiveLocations = _.filter( importedActiveLocations, function( locId ) {
                              return !_.contains( ['nimble_local_header', 'nimble_local_footer'], locId );
                        });

                        if ( _.isArray( importedActiveLocations ) && _.isArray( currentActiveLocations ) ) {
                              var importedActiveLocationsNotAvailableInCurrentActiveLocations = $(importedActiveLocations).not(currentActiveLocations).get();

                              if ( !_.isEmpty( importedActiveLocationsNotAvailableInCurrentActiveLocations ) ) {
                                    $pre_import_button.hide();
                                    input.container.find('.czr-import-dialog').slideToggle();
                                    api.infoLog('sek-pre-import => imported locations missing in current page.', importedActiveLocationsNotAvailableInCurrentActiveLocations );
                              } else {
                                    _import();
                              }
                        } else {
                              // if current and imported location are not arrays, there's a problem.
                              api.previewer.trigger('sek-notify', {
                                    notif_id : 'import-failed',
                                    type : 'info',
                                    duration : 30000,
                                    message : [
                                          '<span style="color:#0075a2">',
                                            '<strong>',
                                            sektionsLocalizedData.i18n['Import failed'],
                                            '</strong>',
                                          '</span>'
                                    ].join('')
                              });
                              _doAlwaysAfterImportApiSettingUpdate();
                        }
                  };//_pre_import_checks


                  ////////////////////////////////////////////////////////
                  // IMPORT
                  ////////////////////////////////////////////////////////
                  var _import = function( params ) {
                        params = params || {};
                        // Bail here if the file input is invalid
                        if ( $file_input.length < 1 || _.isUndefined( $file_input[0] ) || ! $file_input[0].files || _.isEmpty( $file_input.val() ) ) {
                              api.previewer.trigger('sek-notify', {
                                    notif_id : 'missing-import-file',
                                    type : 'info',
                                    duration : 30000,
                                    message : [
                                          '<span style="color:#0075a2">',
                                            '<strong>',
                                            sektionsLocalizedData.i18n['Missing file'],
                                            '</strong>',
                                          '</span>'
                                    ].join('')
                              });
                              return;
                        }


                        // make sure a previous warning gets removed
                        api.notifications.remove( 'missing-import-file' );
                        api.notifications.remove( 'import-success' );
                        api.notifications.remove( 'import-failed' );
                        api.notifications.remove( 'img-import-errors');

                        // display the uploading message
                        input.container.find('.sek-uploading').show();

                        var fd = new FormData();
                        fd.append( 'file_candidate', $file_input[0].files[0] );
                        fd.append( 'action', 'sek_get_imported_file_content' );
                        fd.append( 'nonce', api.settings.nonce.save );

                        // Make sure we have a correct scope provided
                        if ( !_.contains( ['local', 'global'], inputRegistrationParams.scope ) ) {
                              api.errare('sek-import input => invalid scope provided', inputRegistrationParams.scope );
                              return;
                        }
                        fd.append( 'skope', inputRegistrationParams.scope);
                        // When doing the pre_import_check, we inform the server about it
                        // so that the image sniff and upload is not processed at this stage.
                        if ( params.pre_import_check ) {
                              fd.append( 'pre_import_check', params.pre_import_check );
                        }

                        __request__ = $.ajax({
                              url: wp.ajax.settings.url,
                              data: fd,
                              // Setting processData to false lets you prevent jQuery from automatically transforming the data into a query string. See the docs for more info. http://api.jquery.com/jQuery.ajax/
                              // Setting the contentType to false is imperative, since otherwise jQuery will set it incorrectly. https://stackoverflow.com/a/5976031/33080
                              processData: false,
                              contentType: false,
                              type: 'POST',
                              // success: function(data){
                              //   alert(data);
                              // }
                        });

                        // When pre checking, return a promise
                        if ( params.pre_import_check ) {
                            return $.Deferred( function() {
                                  var dfd = this;
                                  __request__
                                        .done( function( server_resp ) {
                                              if( !server_resp.success ) {
                                                    dfd.reject( server_resp );
                                              }
                                              if ( !_isImportedContentEligibleForAPI( server_resp ) ) {
                                                    dfd.reject( server_resp );
                                              }
                                              dfd.resolve( server_resp );
                                        })
                                        .fail( function( server_resp ) {
                                              dfd.reject( server_resp );
                                        })
                                        .always( function() {
                                              //input.container.find('.sek-uploading').hide();
                                        });
                            });
                        }

                        // fire a previewer loader
                        // and and uploading message
                        // both removed on .always()
                        input.container.find('.sek-uploading').show();
                        api.previewer.send( 'sek-maybe-print-loader', { fullPageLoader : true });

                        // At this stage, we are not in a pre-check case
                        // the ajax request is processed and will upload images if needed
                        __request__
                              .done( function( server_resp ) {
                                    // we have a server_resp well structured { success : true, data : { data : , metas, img_errors } }
                                    // Let's set the unique level ids
                                    var _setIds = function( _data ) {
                                          if ( _.isObject( _data ) || _.isArray( _data ) ) {
                                                _.each( _data, function( _v, _k ) {
                                                      // go recursive ?
                                                      if ( _.isObject( _v ) || _.isArray( _v ) ) {
                                                            _data[_k] = _setIds( _v );
                                                      }
                                                      // double check on both the key and the value
                                                      // also re-generates new ids when the export has been done without replacing the ids by '__rep__me__'
                                                      if ( 'id' === _k && _.isString( _v ) && ( 0 === _v.indexOf( '__rep__me__' ) || 0 === _v.indexOf( '__nimble__' ) ) ) {
                                                            _data[_k] = sektionsLocalizedData.optPrefixForSektionsNotSaved + api.czr_sektions.guid();
                                                      }
                                                });
                                          }
                                          return _data;
                                    };
                                    server_resp.data.data.collection = _setIds( server_resp.data.data.collection );
                                    // and try to update the api setting
                                    _doUpdateApiSetting( server_resp, params );
                              })
                              .fail( function( response ) {
                                    api.errare( 'sek-import input => ajax error', response );
                                    api.previewer.trigger('sek-notify', {
                                          notif_id : 'import-failed',
                                          type : 'error',
                                          duration : 30000,
                                          message : [
                                                '<span>',
                                                  '<strong>',
                                                  sektionsLocalizedData.i18n['Import failed, file problem'],
                                                  '</strong>',
                                                '</span>'
                                          ].join('')
                                    });
                              })
                              .always( _doAlwaysAfterImportApiSettingUpdate );//$.ajax()
                  };//_import()


                  // @return a boolean
                  // server_resp : { success : true, data : {...} }
                  // check if :
                  // - server resp is a success
                  // - the server_response is well formed
                  var _isImportedContentEligibleForAPI = function( server_resp ) {
                        var status = true;
                        // If the setting value is unchanged, no need to go further
                        // is_local is decided with the input id => @see revision_history input type.
                        var unserialized_file_content = server_resp.data,
                            import_success = server_resp.success,
                            importErrorMsg = null;

                        // PHP generates the export like this:
                        // $export = array(
                        //     'data' => sek_get_skoped_seks( $_REQUEST['skope_id'] ),
                        //     'metas' => array(
                        //         'skope_id' => $_REQUEST['skope_id'],
                        //         'version' => NIMBLE_VERSION,
                        //         // is sent as a string : "__after_header,__before_main_wrapper,loop_start,__before_footer"
                        //         'active_locations' => is_string( $_REQUEST['active_locations'] ) ? explode( ',', $_REQUEST['active_locations'] ) : array(),
                        //         'date' => date("Y-m-d")
                        //     )
                        // );
                        // @see sek_maybe_export()

                        //api.infoLog('AJAX SUCCESS file_content ', server_resp, unserialized_file_content );
                        if ( !import_success ) {
                             importErrorMsg = [ sektionsLocalizedData.i18n['Import failed'], unserialized_file_content ].join(' : ');
                        }

                        if ( _.isNull( importErrorMsg ) && ! _.isObject( unserialized_file_content ) ) {
                              importErrorMsg = sektionsLocalizedData.i18n['Import failed, invalid file content'];
                        }

                        // Verify that we have the setting value and the import metas
                        var importSettingValue = unserialized_file_content.data,
                            importMetas = unserialized_file_content.metas,
                            imgImporErrors = unserialized_file_content.img_errors;

                        if ( _.isNull( importErrorMsg ) && ! _.isObject( importSettingValue ) ) {
                              importErrorMsg = sektionsLocalizedData.i18n['Import failed, invalid file content'];
                        }

                        if ( _.isNull( importErrorMsg ) && ! _.isObject( importMetas ) ) {
                              importErrorMsg = sektionsLocalizedData.i18n['Import failed, invalid file content'];
                        }

                        if ( _.isNull( importErrorMsg ) && _.isEqual( api( currentSetId )(), importSettingValue ) ) {
                              api.infoLog('sek-import input => Setting unchanged');
                              status = false;
                        }

                        // bail here if we have an import error msg
                        if ( !_.isNull( importErrorMsg ) ) {
                              api.errare('sek-import input => invalid data sent from server', unserialized_file_content );
                              api.previewer.trigger('sek-notify', {
                                    notif_id : 'import-failed',
                                    type : 'error',
                                    duration : 30000,
                                    message : [
                                          '<span>',
                                            '<strong>',
                                            importErrorMsg,
                                            '</strong>',
                                          '</span>'
                                    ].join('')
                              });
                              status = false;
                        }

                        // Img importation errors ?
                        if ( !_.isEmpty( imgImporErrors ) ) {
                              api.previewer.trigger('sek-notify', {
                                    notif_id : 'img-import-errors',
                                    type : 'info',
                                    duration : 60000,
                                    message : [
                                          '<span style="color:#0075a2">',
                                            [
                                              '<strong>' + sektionsLocalizedData.i18n['Some image(s) could not be imported'] + '</strong><br/>',
                                              '<span style="font-size:11px">' + imgImporErrors + '</span>'
                                            ].join(' : '),
                                          '</span>'
                                    ].join('')
                              });
                        }
                        return status;
                  };



                  // fired on ajaxrequest done
                  // At this stage, the server_resp data structure has been validated.
                  // We can try to the update the api setting
                  var _doUpdateApiSetting = function( server_resp, params ){
                        params = params || {};
                        if ( !_isImportedContentEligibleForAPI( server_resp ) ) {
                              _doAlwaysAfterImportApiSettingUpdate();
                              return;
                        }
                        // api.infoLog('api.czr_sektions.localSectionsSettingId()?', api.czr_sektions.localSectionsSettingId());
                        // api.infoLog('inputRegistrationParams.scope ?', inputRegistrationParams.scope );

                        //api.infoLog('TODO => verify metas => version, active locations, etc ... ');

                        // Update the setting api via the normalized method
                        // the scope will determine the setting id, local or global
                        api.czr_sektions.updateAPISetting({
                              action : 'sek-import-from-file',
                              scope : 'global' === inputRegistrationParams.scope,//<= will determine which setting will be updated,
                              // => self.getGlobalSectionsSettingId() or self.localSectionsSettingId()
                              imported_content : server_resp.data,
                              assign_missing_locations : params.assign_missing_locations,
                              keep_existing_sections : input.input_parent.czr_Input('keep_existing_sections')()
                        }).done( function() {
                              // Clean an regenerate the local option setting
                              // Settings are normally registered once and never cleaned, unlike controls.
                              // After the import, updating the setting value will refresh the sections
                              // but the local options, persisted in separate settings, won't be updated if the settings are not cleaned
                              if ( 'local' === inputRegistrationParams.scope ) {
                                    api.czr_sektions.generateUI({
                                          action : 'sek-generate-local-skope-options-ui',
                                          clean_settings : true//<= see api.czr_sektions.generateUIforLocalSkopeOptions()
                                    });
                              }

                              //_notify( sektionsLocalizedData.i18n['The revision has been successfully restored.'], 'success' );
                              api.previewer.refresh();
                              api.previewer.trigger('sek-notify', {
                                    notif_id : 'import-success',
                                    type : 'success',
                                    duration : 30000,
                                    message : [
                                          '<span>',
                                            '<strong>',
                                            sektionsLocalizedData.i18n['File successfully imported'],
                                            '</strong>',
                                          '</span>'
                                    ].join('')
                              });
                        }).fail( function( response ) {
                              api.errare( 'sek-import input => error when firing ::updateAPISetting', response );
                              api.previewer.trigger('sek-notify', {
                                    notif_id : 'import-failed',
                                    type : 'error',
                                    duration : 30000,
                                    message : [
                                          '<span>',
                                            '<strong>',
                                            [ sektionsLocalizedData.i18n['Import failed'], response ].join(' : '),
                                            '</strong>',
                                          '</span>'
                                    ].join('')
                              });
                        });

                        // Refresh the preview, so the markup is refreshed and the css stylesheet are generated
                        api.previewer.refresh();
                  };//_doUpdateApiSetting()

                  var _doAlwaysAfterImportApiSettingUpdate = function() {
                        api.previewer.send( 'sek-clean-loader', { cleanFullPageLoader : true });
                        input.container.find('.sek-uploading').hide();
                        // Clean the file input val
                        $file_input.val('').trigger('change');
                        // Close the import dialog
                        input.container.find('.czr-import-dialog').hide();
                        // display back the pre import button
                        $pre_import_button.show();
                  };





                  ////////////////////////////////////////////////////////
                  // EXPORT
                  ////////////////////////////////////////////////////////
                  var _export = function() {
                          var query = [],
                              query_params = {
                                    sek_export_nonce : api.settings.nonce.save,
                                    skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),
                                    active_locations : api.czr_sektions.activeLocations()
                              };
                          _.each( query_params, function(v,k) {
                                query.push( encodeURIComponent(k) + '=' + encodeURIComponent(v) );
                          });

                          // The ajax action is used to make a pre-check
                          // the idea is to avoid a white screen when generating the download window afterwards
                          wp.ajax.post( 'sek_pre_export_checks', {
                                nonce: api.settings.nonce.save,
                                sek_export_nonce : api.settings.nonce.save,
                                skope_id : api.czr_skopeBase.getSkopeProperty( 'skope_id' ),
                                active_locations : api.czr_sektions.activeLocations()
                          }).done( function() {
                                // disable the 'beforeunload' listeners generating popup window when the changeset is dirty
                                $( window ).off( 'beforeunload' );
                                // Generate a download window
                                // @see add_action( 'customize_register', '\Nimble\sek_catch_export_action', PHP_INT_MAX );
                                window.location.href = [
                                      sektionsLocalizedData.customizerURL,
                                      '?',
                                      query.join('&')
                                ].join('');
                                // re-enable the listeners
                                $( window ).on( 'beforeunload' );
                          }).fail( function( error_resp ) {
                                api.previewer.trigger('sek-notify', {
                                      notif_id : 'import-failed',
                                      type : 'error',
                                      duration : 30000,
                                      message : [
                                            '<span>',
                                              '<strong>',
                                              [ sektionsLocalizedData.i18n['Export failed'], encodeURIComponent( error_resp ) ].join(' '),
                                              '</strong>',
                                            '</span>'
                                      ].join('')
                                });
                          });
                  };//_export()

            }//import_export()
      });//$.extend( api.czrInputMap, {})
})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {

      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            simpleselect : function( selectOptions ) {
                  api.czr_sektions.setupSelectInput.call( this, selectOptions );
            },
            multiselect : function( selectOptions ) {
                  api.czr_sektions.setupSelectInput.call( this, selectOptions );
            },

      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      // input_type => callback fn to fire in the Input constructor on initialize
      // the callback can receive specific params define in each module constructor
      // For example, a content picker can be given params to display only taxonomies
      // the default input_event_map can also be overriden in this callback
      $.extend( api.czrInputMap, {
            category_picker : function( params ) {
                  var selectOptions,
                      input = this,
                      $selectEl = $( 'select[data-czrtype]', input.container );

                  var getInputValue = function() {
                        var inputValue = input();
                        // when select is multiple, the value is an array
                        inputValue = _.isString( inputValue ) ? [ inputValue ] : inputValue;
                        return !_.isArray( inputValue ) ? [] : inputValue;
                  };


                  var _getCategoryCollection = function() {
                        return $.Deferred( function( _dfd_ ) {
                              if ( ! _.isEmpty( api.czr_sektions.post_categories ) ) {
                                    _dfd_.resolve( api.czr_sektions.post_categories );
                              } else {
                                    wp.ajax.post( 'sek_get_post_categories', {
                                          nonce: api.settings.nonce.save,
                                    }).done( function( raw_cat_collection ) {
                                          if ( !_.isArray( raw_cat_collection ) ) {
                                                api.errare( input.id + ' => error => invalid category collection sent by server');
                                          }
                                          var catCollection = {};
                                          // server sends
                                          // [
                                          //  0: {id: 2, slug:'my-category', name: "My category"}
                                          //  1: {id: 11, slug:'my-category', name: "cat10"}
                                          //  ...
                                          // ]
                                          _.each( raw_cat_collection, function( cat_data ) {
                                                if ( _.isEmpty( cat_data.slug ) || _.isEmpty( cat_data.name ) ) {
                                                      _dfd_.reject( 'missing slug or name for at least one category' );
                                                } else {
                                                      catCollection[ cat_data.slug ] = cat_data.name;
                                                }

                                          });
                                          api.czr_sektions.post_categories = catCollection;
                                          _dfd_.resolve( api.czr_sektions.post_categories );
                                    }).fail( function( _r_ ) {
                                          _dfd_.reject( _r_ );
                                    });
                              }
                        });
                  };

                  // do
                  var _fetchServerCatsAndInstantiateSelect2 = function( params ) {
                        if ( true === input.catCollectionSet )
                          return;
                        $.when( _getCategoryCollection() ).done( function( _catCollection ) {
                              _generateOptionsAndInstantiateSelect2(_catCollection);
                              if ( params && true === params.open_on_init ) {
                                    // let's open select2 after a delay ( because there's no 'ready' event with select2 )
                                    _.delay( function() {
                                          try{ $selectEl.czrSelect2('open'); } catch(er) {}
                                    }, 100 );
                              }
                        }).fail( function( _r_ ) {
                              api.errare( input.id + ' => fail response when _getCategoryCollection()', _r_ );
                        });
                        input.catCollectionSet = true;
                  };

                  var _generateOptionsAndInstantiateSelect2 = function( selectOptions ) {
                        //generates the options
                        _.each( selectOptions , function( title, value ) {
                              var _attributes = {
                                        value : value,
                                        html: title
                                  };
                              if ( _.contains( getInputValue(), value ) ) {
                                    $.extend( _attributes, { selected : "selected" } );
                              }
                              $selectEl.append( $('<option>', _attributes) );
                        });
                        // see how the tmpl is rendered server side in PHP with ::ac_set_input_tmpl_content()
                        $selectEl.czrSelect2({
                              closeOnSelect: true,
                              templateSelection: function czrEscapeMarkup(obj) {
                                    //trim dashes
                                    return obj.text.replace(/\u2013|\u2014/g, "");
                              }
                        });

                        //handle case when all choices become unselected
                        $selectEl.on('change', function(){
                              if ( 0 === $(this).find("option:selected").length ) {
                                    input([]);
                              }
                        });
                  };// _generateOptionsAnd...()
                  // schedule the catCollectionSet after a delay
                  //_.delay( function() { _fetchServerCatsAndInstantiateSelect2( { open_on_init : false } );}, 1000 );

                  // on init, instantiate select2 with the input() values only
                  var selectOptionsOnInit = {};
                  _.each( getInputValue(), function( _val ) {
                        selectOptionsOnInit[ _val ] = ( _val + '' ).replace( /-/g, ' ');
                  });
                  _generateOptionsAndInstantiateSelect2( selectOptionsOnInit );

                  // re-generate select2 on click with the server collection
                  input.container.on('click', function() {
                        if ( true === input.catCollectionSet )
                          return;
                        // destroy the temporary instance
                        $selectEl.czrSelect2('destroy');
                        // destroy the temporary options
                        $.when( $selectEl.find('option').remove() ).done( function() {
                              _fetchServerCatsAndInstantiateSelect2( { open_on_init : true } );
                        });
                  });

            }//category_picker()
      });//$.extend( api.czrInputMap, {})


})( wp.customize, jQuery, _ );//global sektionsLocalizedData
( function ( api, $, _ ) {
      // all available input type as a map
      api.czrInputMap = api.czrInputMap || {};

      $.extend( api.czrInputMap, {
            grid_layout : function( params ) {
                  var input = this,
                      $wrapper = $('.sek-grid-layout-wrapper', input.container ),
                      $mainInput = $wrapper.find( 'input[type="hidden"]');

                  // SETUP
                  // Setup the initial state of the number input
                  $mainInput.val( input() );

                  // Schedule choice changes on button click
                  $wrapper.on( 'click', '[data-sek-grid-layout]', function( evt, params ) {
                        evt.stopPropagation();
                        // handle the is-selected css class toggling
                        $wrapper.find('[data-sek-grid-layout]').removeClass('selected').attr( 'aria-pressed', false );
                        $(this).addClass('selected').attr( 'aria-pressed', true );
                        var newChoice;
                        try { newChoice = $(this).data('sek-grid-layout'); } catch( er ) {
                              api.errare( input.type + ' => error when attaching click event', er );
                        }
                        input( newChoice );
                  });


                  // INITIALIZES
                  // trigger a click on the initial unit
                  $( '[data-sek-grid-layout="' + input() + '"]', $wrapper ).trigger('click');
            }
      });// $.extend( api.czrInputMap
})( wp.customize, jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
/* ------------------------------------------------------------------------- *
 *  CONTENT TYPE SWITCHER
/* ------------------------------------------------------------------------- */
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_content_type_switcher_module : {
                  //mthds : SectionPickerModuleConstructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_content_type_switcher_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_content_type_switcher_module' )
                  )
            },
      });

      api.czrInputMap = api.czrInputMap || {};
      //input_type => callback fn to fire in the Input constructor on initialize
      //the callback can receive specific params define in each module constructor
      //For example, a content picker can be given params to display only taxonomies
      $.extend( api.czrInputMap, {
            content_type_switcher : function( input_options ) {
                  var input = this,
                      _section_,
                      initial_content_type;

                  if ( ! api.section.has( input.module.control.section() ) ) {
                        throw new Error( 'api.czrInputMap.content_type_switcher => section not registered' );
                  }
                  _section_ = api.section( input.module.control.section() );

                  // attach click event on data-sek-content-type buttons
                  input.container.on('click', '[data-sek-content-type]', function( evt ) {
                        evt.preventDefault();
                        // handle the is-selected css class toggling
                        input.container.find('[data-sek-content-type]').removeClass('is-selected').attr( 'aria-pressed', false );
                        $(this).addClass('is-selected').attr( 'aria-pressed', true );
                        api.czr_sektions.currentContentPickerType( $(this).data( 'sek-content-type') );
                  });


                  var _do_ = function( contentType ) {
                        input.container.find( '[data-sek-content-type="' + ( contentType || 'module' ) + '"]').trigger('click');
                        _.each( _section_.controls(), function( _control_ ) {
                              if ( ! _.isUndefined( _control_.content_type ) ) {
                                    _control_.active( contentType === _control_.content_type );
                              }
                        });
                  };

                  // Initialize
                  // Fixes issue https://github.com/presscustomizr/nimble-builder/issues/248
                  api.czr_sektions.currentContentPickerType = api.czr_sektions.currentContentPickerType || new api.Value( input() );
                  _do_( api.czr_sektions.currentContentPickerType() );

                  // Schedule a reaction to changes
                  api.czr_sektions.currentContentPickerType.bind( function( contentType ) {
                        _do_( contentType );
                  });
            }
      });
})( wp.customize , jQuery, _ );





/* ------------------------------------------------------------------------- *
 *  MODULE PICKER MODULE
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_module_picker_module : {
                  //mthds : ModulePickerModuleConstructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_module_picker_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel :  _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_module_picker_module' )
                  )
            },
      });

      api.czrInputMap = api.czrInputMap || {};

      //input_type => callback fn to fire in the Input constructor on initialize
      //the callback can receive specific params define in each module constructor
      //For example, a content picker can be given params to display only taxonomies
      $.extend( api.czrInputMap, {
            module_picker : function( input_options ) {
                var input = this;
                // Mouse effect with cursor: -webkit-grab; -webkit-grabbing;
                // input.container.find('[draggable]').each( function() {
                //       $(this).on( 'mousedown mouseup', function( evt ) {
                //             switch( evt.type ) {
                //                   case 'mousedown' :
                //                         //$(this).addClass('sek-grabbing');
                //                   break;
                //                   case 'mouseup' :
                //                         //$(this).removeClass('sek-grabbing');
                //                   break;
                //             }
                //       });
                // });
                api.czr_sektions.trigger( 'sek-refresh-dragzones', { type : 'module', input_container : input.container } );
                //console.log( this.id, input_options );
            }
      });
})( wp.customize , jQuery, _ );



/* ------------------------------------------------------------------------- *
 *  SECTION PICKER MODULES
/* ------------------------------------------------------------------------- */
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      // var section_modules = [
      //       'sek_intro_sec_picker_module',
      //       'sek_features_sec_picker_module',
      //       'sek_contact_sec_picker_module',
      //       'sek_column_layouts_sec_picker_module',
      //       'sek_header_sec_picker_module',
      //       'sek_footer_sec_picker_module'
      // ];

      var section_modules = sektionsLocalizedData.presetSectionsModules;
      if ( ! _.isArray( section_modules ) || _.isEmpty( section_modules ) ) {
            api.errare( 'api.czrModuleMap => error when adding section modules');
            return;
      }

      _.each( section_modules, function( module_type ) {
            api.czrModuleMap[ module_type ] = {
                  //mthds : SectionPickerModuleConstructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( module_type, 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( module_type )
                  )
            };
      });
})( wp.customize , jQuery, _ );






/* ------------------------------------------------------------------------- *
 *  MY SECTIONS MODULE
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;

                  // EXTEND THE DEFAULT CONSTRUCTORS FOR INPUT
                  module.inputConstructor = api.CZRInput.extend({
                        initialize : function( name, options ) {
                              var input = this;
                              api.CZRInput.prototype.initialize.call( input, name, options );
                              input.isReady.then( function() {
                                    input.renderUserSavedSections();
                                    api.czr_sektions.trigger( 'sek-refresh-dragzones', { type : 'preset_section', input_container : input.container } );
                              });
                        },


                        renderUserSavedSections : function() {
                              var input = this,
                                  html = '',
                                  $wrapper = input.container.find('.sek-content-type-wrapper'),
                                  creation_date = '',
                                  // https://stackoverflow.com/questions/3552461/how-to-format-a-javascript-date
                                  formatDate = function(date) {
                                      var monthNames = [
                                          "January", "February", "March",
                                          "April", "May", "June", "July",
                                          "August", "September", "October",
                                          "November", "December"
                                      ];

                                      var day = date.getDate(),
                                          monthIndex = date.getMonth(),
                                          year = date.getFullYear(),
                                          hours = date.getHours(),
                                          minutes = date.getMinutes(),
                                          seconds = date.getSeconds();

                                      return [
                                            day,
                                            monthNames[monthIndex],
                                            year
                                            //[hours,minutes,seconds].join(':')
                                      ].join(' ');
                                  };

                              _.each( sektionsLocalizedData.userSavedSektions, function( secData, secKey ) {
                                    try { creation_date = formatDate( new Date( secData.creation_date.replace( /-/g, '/' ) ) ); } catch( er ) {
                                          api.errare( '::renderUserSavedSections => formatDate => error', er );
                                    }
                                    html = [
                                          '<div class="sek-user-section-wrapper">',
                                            '<div class="sek-saved-section-title"><i class="sek-remove-user-section far fa-trash-alt"></i>' + secData.title + '</div>',
                                            '<div draggable="true" data-sek-is-user-section="true" data-sek-section-type="' + secData.type +'" data-sek-content-type="preset_section" data-sek-content-id="' + secKey +'" style="" title="' + secData.title + '">',
                                              '<div class="sek-overlay"></div>',
                                              '<div class="sek-saved-section-description">' + secData.description + '</div>',
                                              ! _.isEmpty( creation_date ) ? ( '<div class="sek-saved-section-date"><i class="far fa-calendar-alt"></i> @missi18n Created : ' + creation_date + '</div>' ) : '',
                                            '</div>',
                                          '</div>'
                                    ].join('');
                                    $wrapper.append( html );
                              });
                        }
                  });

                  // run the parent initialize
                  // Note : must be always invoked always after the input / item class extension
                  // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

                  // module.embedded.then( function() {
                  //       console.log('MODULE READY=> lets dance',  module.container,  module.container.find('.sek-content-type-wrapper') );
                  // });
            },//initialize
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      if ( sektionsLocalizedData.isSavedSectionEnabled ) {
            $.extend( api.czrModuleMap, {
                  sek_my_sections_sec_picker_module : {
                        mthds : Constructor,
                        crud : false,
                        name : api.czr_sektions.getRegisteredModuleProperty( 'sek_my_sections_sec_picker_module', 'name' ),
                        has_mod_opt : false,
                        ready_on_section_expanded : false,
                        ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                        defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_my_sections_sec_picker_module' )
                  },
            });
      }
})( wp.customize , jQuery, _ );







/* ------------------------------------------------------------------------- *
 *  SECTION PICKER INPUT
/* ------------------------------------------------------------------------- */
( function ( api, $, _ ) {
      api.czrInputMap = api.czrInputMap || {};
      //input_type => callback fn to fire in the Input constructor on initialize
      //the callback can receive specific params define in each module constructor
      //For example, a content picker can be given params to display only taxonomies
      $.extend( api.czrInputMap, {
            section_picker : function( input_options ) {
                  var input = this;
                  // Mouse effect with cursor: -webkit-grab; -webkit-grabbing;
                  // input.container.find('[draggable]').each( function() {
                  //       $(this).on( 'mousedown mouseup', function( evt ) {
                  //             switch( evt.type ) {
                  //                   case 'mousedown' :
                  //                         //$(this).addClass('sek-grabbing');
                  //                   break;
                  //                   case 'mouseup' :
                  //                         //$(this).removeClass('sek-grabbing');
                  //                   break;
                  //             }
                  //       });
                  // });
                  api.czr_sektions.trigger( 'sek-refresh-dragzones', { type : 'preset_section', input_container : input.container } );
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_level_anchor_module : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_level_anchor_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_level_anchor_module' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  //console.log('INITIALIZING SEKTION OPTIONS', id, options );
                  var module = this;

                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );
            },//initialize


            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;
                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'bg-image' :
                                          _.each( [ 'bg-attachment', 'bg-scale', 'bg-repeat', 'bg-apply-overlay', 'bg-color-overlay', 'bg-opacity-overlay', 'bg-parallax', 'bg-parallax-force' ] , function( _inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      var bool = false;
                                                      switch( _inputId_ ) {
                                                            case 'bg-color-overlay' :
                                                            case 'bg-opacity-overlay' :
                                                                  bool = ! _.isEmpty( input() + '' ) && api.CZR_Helpers.isChecked( item.czr_Input('bg-apply-overlay')() );
                                                            break;
                                                            case 'bg-parallax-force' :
                                                                  bool = ! _.isEmpty( input() + '' ) && api.CZR_Helpers.isChecked( item.czr_Input('bg-parallax')() );
                                                            break;
                                                            case 'bg-scale' :
                                                            case 'bg-repeat' :
                                                                  bool = ! _.isEmpty( input() + '' ) && !api.CZR_Helpers.isChecked( item.czr_Input('bg-parallax')() );
                                                            break;
                                                            default :
                                                                  bool = ! _.isEmpty( input() + '' );
                                                            break;
                                                      }
                                                      return bool;
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                                    case 'bg-apply-overlay' :
                                          _.each( [ 'bg-color-overlay', 'bg-opacity-overlay' ] , function(_inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return ! _.isEmpty( item.czr_Input('bg-image')() + '' ) && api.CZR_Helpers.isChecked( input() );
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                                    case 'bg-parallax' :
                                          _.each( [ 'bg-parallax-force', 'bg-scale', 'bg-repeat'] , function(_inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      var bool = false;
                                                      switch( _inputId_ ) {
                                                            case 'bg-parallax-force' :
                                                                  bool = ! _.isEmpty( item.czr_Input('bg-image')() + '' ) && api.CZR_Helpers.isChecked( input() );
                                                            break;
                                                            case 'bg-repeat' :
                                                            case 'bg-scale' :
                                                                  bool = ! _.isEmpty( item.czr_Input('bg-image')() + '' ) && ! api.CZR_Helpers.isChecked( input() );
                                                            break;
                                                      }
                                                      return bool;
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                          // uncheck fixed background if needed
                                          input.bind( function( to ) {
                                                if ( api.CZR_Helpers.isChecked( input() ) ) {
                                                      if ( api.CZR_Helpers.isChecked( item.czr_Input('bg-attachment')()) ) {
                                                            item.czr_Input('bg-attachment').container.find('input[type=checkbox]').trigger('click');
                                                      }
                                                }
                                          });
                                    break;
                                    case 'bg-attachment' :
                                          // uncheck parallax if needed
                                          input.bind( function( to ) {
                                                if ( api.CZR_Helpers.isChecked( input() ) ) {
                                                      if ( api.CZR_Helpers.isChecked( item.czr_Input('bg-parallax')()) ) {
                                                            item.czr_Input('bg-parallax').container.find('input[type=checkbox]').trigger('click');
                                                      }
                                                }
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_level_bg_module : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_level_bg_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_level_bg_module' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  //console.log('INITIALIZING SEKTION OPTIONS', id, options );
                  var module = this;

                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );
            },//initialize

            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;
                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'border-type' :
                                          _.each( [ 'borders' ] , function(_inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return 'none' !== input();
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_level_border_module : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_level_border_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_level_border_module' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );
                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

            },//initialize

            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;
                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'use-custom-breakpoint' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'custom-breakpoint', function() {
                                                return input();
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };

      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_level_breakpoint_module : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_level_breakpoint_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_level_breakpoint_module' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );
                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

            },//initialize

            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;
                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'height-type' :
                                          _.each( [ 'custom-height', 'overflow_hidden' ] , function(_inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return 'custom' === input();
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_level_height_module : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_level_height_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_level_height_module' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_level_visibility_module : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_level_visibility_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_level_visibility_module' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );
                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

            },//initialize

            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;

                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'width-type' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'custom-width', function() {
                                                return 'custom' === input();
                                          });
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'h_alignment', function() {
                                                return 'custom' === input();
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_level_width_module : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_level_width_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_level_width_module' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR INPUT
                  module.inputConstructor = api.CZRInput.extend( module.CZRInputConstructor || {} );
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );
                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

            },//initialize

            // Constructor for the input
            CZRInputConstructor : {
                    // initialize : function( name, options ) {
                    //       var input = this;
                    //       // Expand the editor when ready
                    //       if ( 'detached_tinymce_editor' == input.type ) {
                    //             input.isReady.then( function() {
                    //                   input.container.find('[data-czr-action="open-tinymce-editor"]').trigger('click');
                    //             });
                    //       }
                    //       api.CZRInput.prototype.initialize.call( input, name, options );
                    // },

                    // Overrides the default range_simple method for the column width module
                    range_simple : function( params ) {
                          var input = this,
                              $wrapper = $('.sek-range-with-unit-picker-wrapper', input.container ),
                              $numberInput = $wrapper.find( 'input[type="number"]'),
                              $rangeInput = $wrapper.find( 'input[type="range"]');

                          // Get the moduleRegistration Params
                          var moduleRegistrationParams;
                          try{ moduleRegistrationParams = input.module.control.params.sek_registration_params; } catch( er ) {
                                api.errare('Error when getting the module registration params', er  );
                                return;
                          }
                          if ( _.isUndefined( moduleRegistrationParams.level_id ) ) {
                                api.errare('Error : missing column id', er  );
                                return;
                          }

                          // Get the column id and model,
                          // the parent section model
                          // and calculate the number of columns in the parent section
                          input.columnId = moduleRegistrationParams.level_id;
                          input.columnModel = $.extend( true, {}, api.czr_sektions.getLevelModel( input.columnId ) );
                          input.parentSectionModel = api.czr_sektions.getParentSectionFromColumnId( input.columnId );

                          if ( 'no_match' == input.columnModel ) {
                                api.errare( 'sek_level_width_column module => invalid column model' );
                                return;
                          }
                          if ( 'no_match' == input.parentSectionModel ) {
                                api.errare( 'sek_level_width_column module => invalid parent section model' );
                                return;
                          }

                          // Calculate the column number in the parent section
                          input.colNb = _.size( input.parentSectionModel.collection );

                          // Add the column id identifier, so we can communicate with it and update its value when the column gets resized from user
                          // @see update api setting, 'sek-resize-columns' case
                          $numberInput.attr('data-sek-width-range-column-id', input.columnId );

                          // For single column section, we don't want to display this module
                          if ( 1 === input.colNb ) {
                                input.container.html( ['<p>', sektionsLocalizedData.i18n['This is a single-column section with a width of 100%. You can act on the internal width of the parent section, or adjust padding and margin.']].join('') );
                          } else {
                                input.container.show();
                          }

                          // Always get the value from the model instead of relying on the setting val.
                          // => because the column width value is not only set from the customizer input, but also from the preview when resizing manually, this is an exception
                          var currentColumnModelValue = api.czr_sektions.getLevelModel( input.columnId ),
                              currentColumnWidthValueFromModel = '_not_set_',
                              columnWidthInPercent;

                          if ( 'no_match' == currentColumnModelValue ) {
                                api.errare( 'sek_level_width_column module => invalid column model' );
                                return;
                          }

                          var hasCustomWidth = currentColumnModelValue.options && currentColumnModelValue.options.width && currentColumnModelValue.options.width['custom-width'] && _.isNumber( +currentColumnModelValue.options.width['custom-width'] );

                          if ( hasCustomWidth ) {
                                currentColumnWidthValueFromModel = currentColumnModelValue.options.width['custom-width'];
                          }
                          // For retrocompat, use the former width property when exists.
                          // Deprecated in June 2019. See https://github.com/presscustomizr/nimble-builder/issues/279
                          else if ( ! hasCustomWidth && currentColumnModelValue.width && _.isNumber( +currentColumnModelValue.width ) ) {
                                currentColumnWidthValueFromModel = currentColumnModelValue.width;
                          }


                          if ( '_not_set_' !== currentColumnWidthValueFromModel ) {
                                columnWidthInPercent = currentColumnWidthValueFromModel;
                          }
                          // The default width is "_not_set_"
                          // @see php sek_get_module_params_for_sek_level_width_column()
                          // If not set, calculate the column width in percent based on the number of columns of the parent section
                          else if ( '_not_set_' === input() ) {
                                //$rangeInput.val( $numberInput.val() || 0 );
                                columnWidthInPercent = Math.floor( 100/input.colNb );
                          } else {
                                columnWidthInPercent = input();
                          }

                          // Cast to a number
                          columnWidthInPercent = +parseFloat(columnWidthInPercent).toFixed(3)*1;

                          // Make sure we have a number between 0 and 100
                          if ( ! _.isNumber( columnWidthInPercent ) || 100 < columnWidthInPercent || 0 > columnWidthInPercent ) {
                                api.errare( 'Error => invalid column width', columnWidthInPercent );
                                columnWidthInPercent = 50;
                          }


                          // synchronizes range input and number input
                          // number is the master => sets the input() val
                          $rangeInput.on('input', function( evt, params ) {
                                $numberInput.val( $(this).val() ).trigger('input', params );
                          });
                          // debounced to avoid a intermediate state of visual disorder of the columns
                          $numberInput.on('input', _.debounce(function( evt, params ) {
                                $rangeInput.val( $(this).val() );
                                if ( params && params.is_init )
                                  return;
                                input( +parseFloat( $(this).val() ).toFixed(3) );
                          }, 300 ) );

                          // say it to the api, so we can regenerate the columns width for all columns.
                          // consistently with the action triggered when resizing the column manually

                          // Make sure that we don't react to the event sent when resizing column in update api setting, case 'sek-resize-columns'
                          // where we do $('body').find('[data-sek-width-range-column-id="'+ _candidate_.id +'"]').val( newWidthValue ).trigger('input', { is_resize_column_trigger : true } );
                          // => otherwise it will create an infinite loop
                          //
                          // Debounce to avoid server hammering
                          $numberInput.on( 'input', _.debounce( function( evt, params ) {
                                if ( params && ( params.is_init || params.is_resize_column_trigger ) )
                                  return;
                                input.sayItToApi( $(this).val() );
                          }, 300 ) );
                          // trigger a change on init to sync the range input
                          $rangeInput.val( columnWidthInPercent ).trigger('input', { is_init : true } );
                    },


                    sayItToApi : function( columnWidthInPercent, _val  ) {
                          var input = this;
                          // Get the sister column id
                          // If parent section has at least 2 columns, the sister column is the one on the right if not in last position. On the left if last.
                          var indexOfResizedColumn = _.findIndex( input.parentSectionModel.collection, {id : input.columnId} ),
                              isLastColumn = indexOfResizedColumn + 1 == input.colNb,
                              sisterColumnIndex = isLastColumn ? indexOfResizedColumn - 1 : indexOfResizedColumn + 1,
                              sisterColumnModel = _.find( input.parentSectionModel.collection, function( _val, _key ) { return sisterColumnIndex === _key; });

                          if ( 'no_match' === sisterColumnModel ) {
                                api.errare( 'sek_level_width_column module => invalid sister column model' );
                          }

                          api.previewer.trigger( 'sek-resize-columns', {
                                action : 'sek-resize-columns',
                                level : 'column',
                                in_sektion : input.parentSectionModel.id,
                                id : input.columnId,

                                resized_column : input.columnId,
                                sister_column : sisterColumnModel.id ,

                                resizedColumnWidthInPercent : columnWidthInPercent,

                                col_number : input.colNb
                          });
                    }

            },//CZRTextEditorInputMths
            // CZRItemConstructor : {
            //       //overrides the parent ready
            //       ready : function() {
            //             var item = this;
            //             //wait for the input collection to be populated,
            //             //and then set the input visibility dependencies
            //             item.inputCollection.bind( function( col ) {
            //                   if( _.isEmpty( col ) )
            //                     return;
            //                   try { item.setInputVisibilityDeps(); } catch( er ) {
            //                         api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
            //                   }
            //             });//item.inputCollection.bind()

            //             //fire the parent
            //             api.CZRItem.prototype.ready.call( item );
            //       },


            //       //Fired when the input collection is populated
            //       //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
            //       setInputVisibilityDeps : function() {
            //             var item = this,
            //                 module = item.module;

            //             //Internal item dependencies
            //             item.czr_Input.each( function( input ) {
            //                   switch( input.id ) {
            //                         case 'width-type' :
            //                               api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'custom-width', function() {
            //                                     return 'custom' === input();
            //                               });
            //                               api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'h_alignment', function() {
            //                                     return 'custom' === input();
            //                               });
            //                         break;
            //                   }
            //             });
            //       }
            // }//CZRItemConstructor
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_level_width_column : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_level_width_column', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_level_width_column' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );
                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

            },//initialize

            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;

                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'use-custom-outer-width' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'outer-section-width', function() {
                                                return input();
                                          });
                                    break;
                                    case 'use-custom-inner-width' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'inner-section-width', function() {
                                                return input();
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_level_width_section : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_level_width_section', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_level_width_section' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_level_spacing_module : {
                  mthds : '',
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_level_spacing_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_level_spacing_module' )
                  )
            },
      });
})( wp.customize , jQuery, _ );
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_local_template : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_local_template', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_local_template' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );
                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

            },//initialize

            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;

                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'use-custom-outer-width' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'outer-section-width', function() {
                                                return input();
                                          });
                                    break;
                                    case 'use-custom-inner-width' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'inner-section-width', function() {
                                                return input();
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };//Constructor


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_local_widths : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_local_widths', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_local_widths' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {

      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_local_custom_css : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_local_custom_css', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_local_custom_css' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {

      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_local_reset : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_local_reset', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_local_reset' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_local_performances : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_local_performances', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_local_performances' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_local_header_footer : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_local_header_footer', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_local_header_footer' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_local_revisions : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_local_revisions', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_local_revisions' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_local_imp_exp : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_local_imp_exp', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_local_imp_exp' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );
                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

            },//initialize

            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;

                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'links_underline' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'links_underline_hover', function() {
                                                return !input();
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_global_text : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_global_text', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_global_text' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );
                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

            },//initialize

            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;

                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'use-custom-breakpoint' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'global-custom-breakpoint', function() {
                                                return input();
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_global_breakpoint : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_global_breakpoint', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_global_breakpoint' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );
                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

            },//initialize

            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;

                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'use-custom-outer-width' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'outer-section-width', function() {
                                                return input();
                                          });
                                    break;
                                    case 'use-custom-inner-width' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'inner-section-width', function() {
                                                return input();
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_global_widths : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_global_widths', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_global_widths' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_global_performances : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_global_performances', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_global_performances' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_global_header_footer : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_global_header_footer', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_global_header_footer' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;
                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );
                  //run the parent initialize
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

            },//initialize

            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;

                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'enable' :
                                          _.each( [ 'public_key', 'private_key', 'badge', 'show_failure_message', 'failure_message', 'score' ] , function( _inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      var bool = false;
                                                      switch( _inputId_ ) {
                                                            case 'failure_message' :
                                                                  bool = input() && item.czr_Input('show_failure_message')();
                                                            break;
                                                            default :
                                                                  bool = input();
                                                            break;
                                                      }
                                                      return bool;
                                                }); } catch( er ) {
                                                      api.errare( module.module_type + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                                    case 'show_failure_message' :
                                          _.each( [ 'failure_message' ] , function( _inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return input() && item.czr_Input('enable')();
                                                }); } catch( er ) {
                                                      api.errare( module.module_type + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_global_recaptcha : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_global_recaptcha', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_global_recaptcha' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_global_revisions : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_global_revisions', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_global_revisions' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {

      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_global_reset : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_global_reset', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_global_reset' )
                  )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            sek_global_beta_features : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'sek_global_beta_features', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  defaultItemModel : _.extend(
                        { id : '', title : '' },
                        api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'sek_global_beta_features' )
                  )
            },
      });
})( wp.customize , jQuery, _ );/* ------------------------------------------------------------------------- *
 *  IMAGE MAIN SETTINGS
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;

                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                  // run the parent initialize
                  // Note : must be always invoked always after the input / item class extension
                  // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

                  //SET THE CONTENT PICKER DEFAULT OPTIONS
                  //@see ::setupContentPicker()
                  module.bind( 'set_default_content_picker_options', function( params ) {
                        params.defaultContentPickerOption.defaultOption = {
                              'title'      : '<span style="font-weight:bold">' + sektionsLocalizedData.i18n['Set a custom url'] + '</span>',
                              'type'       : '',
                              'type_label' : '',
                              'object'     : '',
                              'id'         : '_custom_',
                              'url'        : ''
                        };
                        return params;
                  });
            },//initialize


            // _isChecked : function( v ) {
            //       return 0 !== v && '0' !== v && false !== v && 'off' !== v;
            // },
            //////////////////////////////////////////////////////////
            /// ITEM CONSTRUCTOR
            //////////////////////////////////////////
            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;

                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'img' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'img-size', function() {
                                                return ! _.isEmpty( input()+'' ) && _.isNumber( input() );
                                          });
                                    break;
                                    case 'link-to' :
                                          _.each( [ 'link-pick-url', 'link-custom-url', 'link-target' ] , function( _inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      var bool = false;
                                                      switch( _inputId_ ) {
                                                            case 'link-custom-url' :
                                                                  bool = 'url' === input() && '_custom_' == item.czr_Input('link-pick-url')().id;
                                                            break;
                                                            case 'link-pick-url' :
                                                                  bool = 'url' === input();
                                                            break;
                                                            case 'link-target' :
                                                                  bool = ! _.contains( [ 'no-link', 'img-lightbox' ], input() );
                                                            break;
                                                      }
                                                      return bool;
                                                }); } catch( er ) {
                                                      api.errare( 'Image module => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                                    case 'link-pick-url' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'link-custom-url', function() {
                                                return '_custom_' == input().id && 'url' == item.czr_Input('link-to')();
                                          });
                                    break;
                                    case 'border-type' :
                                          _.each( [ 'borders' ] , function(_inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return 'none' !== input();
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                                    case 'use_custom_width' :
                                          _.each( [ 'custom_width' ] , function( _inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return input();
                                                }); } catch( er ) {
                                                      api.errare( 'Image module => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                                    case 'use_custom_title_attr' :
                                          _.each( [ 'heading_title' ] , function( _inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return input();
                                                }); } catch( er ) {
                                                      api.errare( 'Image module => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                              }
                        });
                  }
            },//CZRItemConstructor

      };//Constructor

      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_image_main_settings_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_image_main_settings_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_image_main_settings_child' )
            },
      });
})( wp.customize , jQuery, _ );








/* ------------------------------------------------------------------------- *
 *  IMAGE BORDERS AND BORDER RADIUS
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                  var module = this;

                  // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                  // run the parent initialize
                  // Note : must be always invoked always after the input / item class extension
                  // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                  api.CZRDynModule.prototype.initialize.call( module, id, options );
            },//initialize


            // _isChecked : function( v ) {
            //       return 0 !== v && '0' !== v && false !== v && 'off' !== v;
            // },
            //////////////////////////////////////////////////////////
            /// ITEM CONSTRUCTOR
            //////////////////////////////////////////
            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;
                        // input controller instance == this
                        var scheduleVisibilityOfInputId = function( controlledInputId, visibilityCallBack ) {
                              //Fire on init
                              item.czr_Input( controlledInputId ).visible( visibilityCallBack() );
                              //React on change
                              this.bind( function( to ) {
                                    item.czr_Input( controlledInputId ).visible( visibilityCallBack() );
                              });
                        };
                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'border-type' :
                                          _.each( [ 'borders' ] , function(_inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return 'none' !== input();
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                              }
                        });
                  }
            },//CZRItemConstructor

      };//Constructor

      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_image_borders_corners_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_image_borders_corners_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_image_borders_corners_child' )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
            initialize: function( id, options ) {
                    //console.log('INITIALIZING IMAGE MODULE', id, options );
                    var module = this;
                    // //EXTEND THE DEFAULT CONSTRUCTORS FOR INPUT
                    module.inputConstructor = api.CZRInput.extend( module.CZRTextEditorInputMths || {} );
                    // //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                    // module.itemConstructor = api.CZRItem.extend( module.CZRSocialsItem || {} );

                    // run the parent initialize
                    // Note : must be always invoked always after the input / item class extension
                    // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                    api.CZRDynModule.prototype.initialize.call( module, id, options );
            },//initialize

            CZRTextEditorInputMths : {
                    initialize : function( name, options ) {
                          var input = this;
                          // Expand the editor when ready
                          if ( 'detached_tinymce_editor' == input.type ) {
                                input.isReady.then( function() {
                                      input.container.find('[data-czr-action="open-tinymce-editor"]').trigger('click');
                                });
                          }
                          api.CZRInput.prototype.initialize.call( input, name, options );
                    }
            },//CZRTextEditorInputMths

            // CZRSocialsItem : { },//CZRSocialsItem
      };//Constructor


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_tinymce_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_tinymce_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_tinymce_child' )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_simple_html_module : {
                  //mthds : SimpleHtmlModuleConstructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_simple_html_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_simple_html_module' )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var FeaturedPagesConstruct = {
            initialize: function( id, options ) {
                  //console.log('INITIALIZING FP MODULE', id, options );
                  var module = this;

                  // //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                  // run the parent initialize
                  // Note : must be always invoked always after the input / item class extension
                  // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                  api.CZRDynModule.prototype.initialize.call( module, id, options );
            },//initialize

            //////////////////////////////////////////////////////////
            /// ITEM CONSTRUCTOR
            //////////////////////////////////////////
            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },
                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;

                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'img-type' :
                                          _.each( [ 'img-id', 'img-size' ] , function( _inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      var bool = false;
                                                      switch( _inputId_ ) {
                                                            case 'img-id' :
                                                                  bool = 'custom' === input();
                                                            break;
                                                            default :
                                                                  bool = 'none' !== input();
                                                            break;
                                                      }
                                                      return bool;
                                                }); } catch( er ) {
                                                      api.errare( 'Featured pages module => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                                    case 'content-type' :
                                          _.each( [ 'content-custom-text' ] , function( _inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return 'custom' === input();
                                                }); } catch( er ) {
                                                      api.errare( 'Featured pages module => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                                    case 'btn-display' :
                                          _.each( [ 'btn-custom-text' ] , function( _inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return input();
                                                }); } catch( er ) {
                                                      api.errare( 'Featured pages module => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                              }
                        });
                  }
            },//CZRItemConstructor
      };//FeaturedPagesConstruct

      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_featured_pages_module : {
                  mthds : FeaturedPagesConstruct,
                  crud : api.czr_sektions.getRegisteredModuleProperty( 'czr_featured_pages_module', 'is_crud' ),
                  hasPreItem : false,//a crud module has a pre item by default
                  refresh_on_add_item : false,// the preview is refreshed on item add
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_featured_pages_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_featured_pages_module' )
            },
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //ICON MODULE
      var Constructor = {
              initialize: function( id, options ) {
                      //console.log('INITIALIZING IMAGE MODULE', id, options );
                      var module = this;

                      //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                      //SET THE CONTENT PICKER DEFAULT OPTIONS
                      //@see ::setupContentPicker()
                      module.bind( 'set_default_content_picker_options', function( params ) {
                            params.defaultContentPickerOption.defaultOption = {
                                  'title'      : '<span style="font-weight:bold">' + sektionsLocalizedData.i18n['Set a custom url'] + '</span>',
                                  'type'       : '',
                                  'type_label' : '',
                                  'object'     : '',
                                  'id'         : '_custom_',
                                  'url'        : ''
                            };
                            return params;
                      });

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize

              /* Helpers */

              //////////////////////////////////////////////////////////
              /// ITEM CONSTRUCTOR
              //////////////////////////////////////////
              CZRItemConstructor : {
                    //overrides the parent ready
                    ready : function() {
                          var item = this;
                          //wait for the input collection to be populated,
                          //and then set the input visibility dependencies
                          item.inputCollection.bind( function( col ) {
                                if( _.isEmpty( col ) )
                                  return;
                                try { item.setInputVisibilityDeps(); } catch( er ) {
                                      api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                                }
                          });//item.inputCollection.bind()

                          //fire the parent
                          api.CZRItem.prototype.ready.call( item );
                    },


                    //Fired when the input collection is populated
                    //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                    setInputVisibilityDeps : function() {
                          var item = this,
                              module = item.module;

                          //Internal item dependencies
                          item.czr_Input.each( function( input ) {
                                switch( input.id ) {
                                      case 'link-to' :
                                            _.each( [ 'link-pick-url', 'link-custom-url', 'link-target' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        var bool = false;
                                                        switch( _inputId_ ) {
                                                              case 'link-custom-url' :
                                                                    bool = 'url' == input() && '_custom_' == item.czr_Input('link-pick-url')().id;
                                                              break;
                                                              default :
                                                                    bool = 'url' == input();
                                                              break;
                                                        }
                                                        return bool;
                                                  }); } catch( er ) {
                                                        api.errare( module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'link-pick-url' :
                                            api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'link-custom-url', function() {
                                                  return '_custom_' == input().id && 'url' == item.czr_Input('link-to')();
                                            });
                                      break;
                                      case 'use_custom_color_on_hover' :
                                            _.each( [ 'color_hover' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                }
                          });
                    }
              },//CZRItemConstructor

      };//Constructor


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_icon_settings_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_icon_settings_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_icon_settings_child' )
            },
      });
})( wp.customize , jQuery, _ );







//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //BUTTON MODULE
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      // EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );
              },//initialize

              CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;
                        // input controller instance == this
                        var scheduleVisibilityOfInputId = function( controlledInputId, visibilityCallBack ) {
                              //Fire on init
                              item.czr_Input( controlledInputId ).visible( visibilityCallBack() );
                              //React on change
                              this.bind( function( to ) {
                                    item.czr_Input( controlledInputId ).visible( visibilityCallBack() );
                              });
                        };
                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'border-type' :
                                          _.each( [ 'borders' ] , function(_inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return 'none' !== input();
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                              }
                        });
                  }
            }//CZRItemConstructor
      };// Constructor
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_icon_spacing_border_child: {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_icon_spacing_border_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_icon_spacing_border_child' )
            }
      });
})( wp.customize , jQuery, _ );/* ------------------------------------------------------------------------- *
 *  HEADING MAIN CHILD
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //HEADING MODULE
      var Constructor  = {
            initialize: function( id, options ) {
                  var module = this;

                  //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                  module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                  // run the parent initialize
                  // Note : must be always invoked always after the input / item class extension
                  // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                  api.CZRDynModule.prototype.initialize.call( module, id, options );

                  //SET THE CONTENT PICKER DEFAULT OPTIONS
                  //@see ::setupContentPicker()
                  module.bind( 'set_default_content_picker_options', function( params ) {
                        params.defaultContentPickerOption.defaultOption = {
                              'title'      : '<span style="font-weight:bold">' + sektionsLocalizedData.i18n['Set a custom url'] + '</span>',
                              'type'       : '',
                              'type_label' : '',
                              'object'     : '',
                              'id'         : '_custom_',
                              'url'        : ''
                        };
                        return params;
                  });
            },//initialize

            // _isChecked : function( v ) {
            //       return 0 !== v && '0' !== v && false !== v && 'off' !== v;
            // },
            //////////////////////////////////////////////////////////
            /// ITEM CONSTRUCTOR
            //////////////////////////////////////////
            CZRItemConstructor : {
                  //overrides the parent ready
                  ready : function() {
                        var item = this;
                        //wait for the input collection to be populated,
                        //and then set the input visibility dependencies
                        item.inputCollection.bind( function( col ) {
                              if( _.isEmpty( col ) )
                                return;
                              try { item.setInputVisibilityDeps(); } catch( er ) {
                                    api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                              }
                        });//item.inputCollection.bind()

                        //fire the parent
                        api.CZRItem.prototype.ready.call( item );
                  },


                  //Fired when the input collection is populated
                  //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                  setInputVisibilityDeps : function() {
                        var item = this,
                            module = item.module;

                        //Internal item dependencies
                        item.czr_Input.each( function( input ) {
                              switch( input.id ) {
                                    case 'link-to' :
                                          _.each( [ 'link-pick-url', 'link-custom-url', 'link-target' ] , function( _inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      var bool = false;
                                                      switch( _inputId_ ) {
                                                            case 'link-custom-url' :
                                                                  bool = input() && '_custom_' == item.czr_Input('link-pick-url')().id;
                                                            break;
                                                            case 'link-pick-url' :
                                                                  bool = input();
                                                            break;
                                                            case 'link-target' :
                                                                  bool = input();
                                                            break;
                                                      }
                                                      return bool;
                                                }); } catch( er ) {
                                                      api.errare( 'Heading module => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                                    case 'link-pick-url' :
                                          api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'link-custom-url', function() {
                                                return '_custom_' == input().id && true === item.czr_Input('link-to')();
                                          });
                                    break;
                              }
                        });
                  }//setInputVisibilityDeps
            },//CZRItemConstructor
      };//Constructor


      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_heading_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_heading_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_heading_child' )
            }
      });
})( wp.customize , jQuery, _ );

/* ------------------------------------------------------------------------- *
 *  HEADING SPACING
/* ------------------------------------------------------------------------- */
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_heading_spacing_child : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_heading_spacing_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_heading_spacing_child' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_divider_module : {
                  //mthds : DividerModuleConstructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_divider_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_divider_module' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_spacer_module : {
                  //mthds : ModuleConstructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_spacer_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_spacer_module' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_map_module : {
                  //mthds : ModuleConstructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_map_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_map_module' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
/* ------------------------------------------------------------------------- *
 *  QUOTE DESIGN
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //BUTTON MODULE
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRButtonItemConstructor || {} );

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize

              //////////////////////////////////////////////////////////
              /// ITEM CONSTRUCTOR
              //////////////////////////////////////////
              CZRButtonItemConstructor : {
                    //overrides the parent ready
                    ready : function() {
                          var item = this;
                          //wait for the input collection to be populated,
                          //and then set the input visibility dependencies
                          item.inputCollection.bind( function( col ) {
                                if( _.isEmpty( col ) )
                                  return;
                                try { item.setInputVisibilityDeps(); } catch( er ) {
                                      api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                                }
                          });//item.inputCollection.bind()

                          //fire the parent
                          api.CZRItem.prototype.ready.call( item );
                    },

                    //Fired when the input collection is populated
                    //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                    setInputVisibilityDeps : function() {
                          var item = this,
                              module = item.module;

                          //Internal item dependencies
                          item.czr_Input.each( function( input ) {
                                switch( input.id ) {
                                      case 'quote_design' :
                                            _.each( [ 'border_width_css', 'border_color_css' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return 'border-before' == input();
                                                  }); } catch( er ) {
                                                        api.errare( 'Quote module => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                            _.each( [ 'icon_color_css', 'icon_size_css' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return 'quote-icon-before' == input();
                                                  }); } catch( er ) {
                                                        api.errare( 'Quote module => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                }
                          });
                    }
              }
      };
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_quote_design_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_quote_design_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_quote_design_child' )
            }
      });
})( wp.customize , jQuery, _ );










/* ------------------------------------------------------------------------- *
 *  QUOTE CONTENT
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_quote_quote_child : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_quote_quote_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_quote_quote_child' )
            }
      });
})( wp.customize , jQuery, _ );






/* ------------------------------------------------------------------------- *
 *  CITE CONTENT
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_quote_cite_child : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_quote_cite_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_quote_cite_child' )
            }
      });
})( wp.customize , jQuery, _ );
/* ------------------------------------------------------------------------- *
 *  BUTTON CONTENT
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //BUTTON MODULE
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                      //SET THE CONTENT PICKER DEFAULT OPTIONS
                      //@see ::setupContentPicker()
                      module.bind( 'set_default_content_picker_options', function( params ) {
                            params.defaultContentPickerOption.defaultOption = {
                                  'title'      : '<span style="font-weight:bold">' + sektionsLocalizedData.i18n['Set a custom url'] + '</span>',
                                  'type'       : '',
                                  'type_label' : '',
                                  'object'     : '',
                                  'id'         : '_custom_',
                                  'url'        : ''
                            };
                            return params;
                      });

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize

              //////////////////////////////////////////////////////////
              /// ITEM CONSTRUCTOR
              //////////////////////////////////////////
              CZRItemConstructor : {
                    //overrides the parent ready
                    ready : function() {
                          var item = this;
                          //wait for the input collection to be populated,
                          //and then set the input visibility dependencies
                          item.inputCollection.bind( function( col ) {
                                if( _.isEmpty( col ) )
                                  return;
                                try { item.setInputVisibilityDeps(); } catch( er ) {
                                      api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                                }
                          });//item.inputCollection.bind()

                          //fire the parent
                          api.CZRItem.prototype.ready.call( item );
                    },

                    //Fired when the input collection is populated
                    //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                    setInputVisibilityDeps : function() {
                          var item = this,
                              module = item.module;

                          //Internal item dependencies
                          item.czr_Input.each( function( input ) {
                                switch( input.id ) {
                                      case 'link-to' :
                                            _.each( [ 'link-pick-url', 'link-custom-url', 'link-target' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        var bool = false;
                                                        switch( _inputId_ ) {
                                                              case 'link-custom-url' :
                                                                    bool = 'url' == input() && '_custom_' == item.czr_Input('link-pick-url')().id;
                                                              break;
                                                              default :
                                                                    bool = 'url' == input();
                                                              break;
                                                        }
                                                        return bool;
                                                  }); } catch( er ) {
                                                        api.errare( 'Button module => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'link-pick-url' :
                                            api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'link-custom-url', function() {
                                                  return '_custom_' == input().id && 'url' == item.czr_Input('link-to')();
                                            });
                                      break;
                                      case 'icon' :
                                            api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'icon-side', function() {
                                                  return !_.isEmpty( input() );
                                            });
                                      break;
                                }
                          });
                    }
              }
      };
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_btn_content_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_btn_content_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_btn_content_child' )
            }
      });
})( wp.customize , jQuery, _ );










/* ------------------------------------------------------------------------- *
 *  BUTTON DESIGN
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //BUTTON MODULE
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize

              //////////////////////////////////////////////////////////
              /// ITEM CONSTRUCTOR
              //////////////////////////////////////////
              CZRItemConstructor : {
                    //overrides the parent ready
                    ready : function() {
                          var item = this;
                          //wait for the input collection to be populated,
                          //and then set the input visibility dependencies
                          item.inputCollection.bind( function( col ) {
                                if( _.isEmpty( col ) )
                                  return;
                                try { item.setInputVisibilityDeps(); } catch( er ) {
                                      api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                                }
                          });//item.inputCollection.bind()

                          //fire the parent
                          api.CZRItem.prototype.ready.call( item );
                    },

                    //Fired when the input collection is populated
                    //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                    setInputVisibilityDeps : function() {
                          var item = this,
                              module = item.module;
                          // input controller instance == this
                          var scheduleVisibilityOfInputId = function( controlledInputId, visibilityCallBack ) {
                                //Fire on init
                                item.czr_Input( controlledInputId ).visible( visibilityCallBack() );
                                //React on change
                                this.bind( function( to ) {
                                      item.czr_Input( controlledInputId ).visible( visibilityCallBack() );
                                });
                          };
                          //Internal item dependencies
                          item.czr_Input.each( function( input ) {
                                switch( input.id ) {
                                      case 'use_custom_bg_color_on_hover' :
                                            _.each( [ 'bg_color_hover' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( 'Button module => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'border-type' :
                                          _.each( [ 'borders' ] , function(_inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return 'none' !== input();
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                      break;
                                      case 'use_box_shadow' :
                                            _.each( [ 'push_effect' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( 'Button module => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                }
                          });
                    }
              }
      };
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_btn_design_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_btn_design_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_btn_design_child' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize

              //////////////////////////////////////////////////////////
              /// ITEM CONSTRUCTOR
              //////////////////////////////////////////
              CZRItemConstructor : {
                    //overrides the parent ready
                    ready : function() {
                          var item = this;
                          //wait for the input collection to be populated,
                          //and then set the input visibility dependencies
                          item.inputCollection.bind( function( col ) {
                                if( _.isEmpty( col ) )
                                  return;
                                try { item.setInputVisibilityDeps(); } catch( er ) {
                                      api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                                }
                          });//item.inputCollection.bind()

                          //fire the parent
                          api.CZRItem.prototype.ready.call( item );
                    },

                    //Fired when the input collection is populated
                    //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                    setInputVisibilityDeps : function() {
                          var item = this,
                              module = item.module;

                          //Internal item dependencies
                          item.czr_Input.each( function( input ) {
                                switch( input.id ) {
                                      case 'layout' :
                                            _.each( [ 'columns', 'img_column_width', 'has_tablet_breakpoint', 'has_mobile_breakpoint' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        var bool = false;
                                                        switch( _inputId_ ) {
                                                              case 'columns' :
                                                                    bool = 'grid' === input();
                                                              break;
                                                              case 'has_tablet_breakpoint' :
                                                              case 'has_mobile_breakpoint' :
                                                              case 'img_column_width' :
                                                                    bool = 'list' === input();
                                                              break;
                                                        }
                                                        return bool;
                                                  }); } catch( er ) {
                                                        api.errare( module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'categories' :
                                            _.each( [ 'must_have_all_cats' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        var input_val = input();
                                                        return _.isArray( input_val ) && input_val.length>1;
                                                  }); } catch( er ) {
                                                        api.errare( module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'custom_grid_spaces' :
                                            _.each( [ 'column_gap', 'row_gap' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'show_excerpt' :
                                            _.each( [ 'excerpt_length' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                }
                          });
                    }
              }
      };
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_post_grid_main_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_post_grid_main_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_post_grid_main_child' )
            }
      });
})( wp.customize , jQuery, _ );




//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize

              //////////////////////////////////////////////////////////
              /// ITEM CONSTRUCTOR
              //////////////////////////////////////////
              CZRItemConstructor : {
                    //overrides the parent ready
                    ready : function() {
                          var item = this;
                          //wait for the input collection to be populated,
                          //and then set the input visibility dependencies
                          item.inputCollection.bind( function( col ) {
                                if( _.isEmpty( col ) )
                                  return;
                                try { item.setInputVisibilityDeps(); } catch( er ) {
                                      api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                                }
                          });//item.inputCollection.bind()

                          //fire the parent
                          api.CZRItem.prototype.ready.call( item );
                    },

                    //Fired when the input collection is populated
                    //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                    setInputVisibilityDeps : function() {
                          var item = this,
                              module = item.module;

                          //Internal item dependencies
                          item.czr_Input.each( function( input ) {
                                switch( input.id ) {
                                      case 'show_thumb' :
                                            _.each( [ 'img_size', 'img_has_custom_height', 'img_height', 'border_radius_css', 'use_post_thumb_placeholder' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        var bool = false;
                                                        switch( _inputId_ ) {
                                                              case 'img_height' :
                                                                    bool = input() && item.czr_Input('img_has_custom_height')();
                                                              break;
                                                              default :
                                                                    bool = input();
                                                              break;
                                                        }
                                                        return bool;
                                                  }); } catch( er ) {
                                                        api.errare( module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'img_has_custom_height' :
                                            _.each( [ 'img_height' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input() && item.czr_Input('show_thumb')();
                                                  }); } catch( er ) {
                                                        api.errare( module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                }
                          });
                    }
              }
      };
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_post_grid_thumb_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_post_grid_thumb_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_post_grid_thumb_child' )
            }
      });
})( wp.customize , jQuery, _ );




//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_post_grid_metas_child : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_post_grid_metas_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_post_grid_metas_child' )
            }
      });
})( wp.customize , jQuery, _ );




//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_post_grid_fonts_child : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_post_grid_fonts_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_post_grid_fonts_child' )
            }
      });
})( wp.customize , jQuery, _ );/* ------------------------------------------------------------------------- *
 *  MENU CONTENT
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_menu_content_child : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_menu_content_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_menu_content_child' )
            }
      });
})( wp.customize , jQuery, _ );


/* ------------------------------------------------------------------------- *
 *  MENU OPTIONS FOR MOBILE DEVICES
/* ------------------------------------------------------------------------- */
//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_menu_mobile_options : {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_menu_mobile_options', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : true,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_menu_mobile_options' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //BUTTON MODULE
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize

              //////////////////////////////////////////////////////////
              /// ITEM CONSTRUCTOR
              //////////////////////////////////////////
              CZRItemConstructor : {
                    //overrides the parent ready
                    ready : function() {
                          var item = this;
                          //wait for the input collection to be populated,
                          //and then set the input visibility dependencies
                          item.inputCollection.bind( function( col ) {
                                if( _.isEmpty( col ) )
                                  return;
                                try { item.setInputVisibilityDeps(); } catch( er ) {
                                      api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                                }
                          });//item.inputCollection.bind()

                          //fire the parent
                          api.CZRItem.prototype.ready.call( item );
                    },

                    //Fired when the input collection is populated
                    //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                    setInputVisibilityDeps : function() {
                          var item = this,
                              module = item.module;

                          //Internal item dependencies
                          item.czr_Input.each( function( input ) {
                                switch( input.id ) {
                                      case 'show_name_field' :
                                            _.each( [ 'name_field_label', 'name_field_required' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( input.module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'show_subject_field' :
                                            _.each( [ 'subject_field_label', 'subject_field_required' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( input.module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'show_message_field' :
                                            _.each( [ 'message_field_label', 'message_field_required' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( input.module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'link-pick-url' :
                                            try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'link-custom-url', function() {
                                                  return input();
                                            }); } catch( er ) {
                                                  api.errare( input.module.module_type + ' => error in setInputVisibilityDeps', er );
                                            }
                                      break;
                                }
                          });
                    }
              }
      };
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_simple_form_fields_child: {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_simple_form_fields_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_simple_form_fields_child' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //BUTTON MODULE
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize

              //////////////////////////////////////////////////////////
              /// ITEM CONSTRUCTOR
              //////////////////////////////////////////
              CZRItemConstructor : {
                    //overrides the parent ready
                    ready : function() {
                          var item = this;
                          //wait for the input collection to be populated,
                          //and then set the input visibility dependencies
                          item.inputCollection.bind( function( col ) {
                                if( _.isEmpty( col ) )
                                  return;
                                try { item.setInputVisibilityDeps(); } catch( er ) {
                                      api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                                }
                          });//item.inputCollection.bind()

                          //fire the parent
                          api.CZRItem.prototype.ready.call( item );
                    },

                    //Fired when the input collection is populated
                    //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                    setInputVisibilityDeps : function() {
                          var item = this,
                              module = item.module;
                          //Internal item dependencies
                          item.czr_Input.each( function( input ) {
                                switch( input.id ) {
                                    case 'border-type' :
                                          _.each( [ 'borders' ] , function(_inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return 'none' !== input();
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                    break;
                                }
                          });
                    }
              }
      };
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_simple_form_design_child: {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_simple_form_design_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_simple_form_design_child' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //BUTTON MODULE
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize

              //////////////////////////////////////////////////////////
              /// ITEM CONSTRUCTOR
              //////////////////////////////////////////
              CZRItemConstructor : {
                    //overrides the parent ready
                    ready : function() {
                          var item = this;
                          //wait for the input collection to be populated,
                          //and then set the input visibility dependencies
                          item.inputCollection.bind( function( col ) {
                                if( _.isEmpty( col ) )
                                  return;
                                try { item.setInputVisibilityDeps(); } catch( er ) {
                                      api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                                }
                          });//item.inputCollection.bind()

                          //fire the parent
                          api.CZRItem.prototype.ready.call( item );
                    },

                    //Fired when the input collection is populated
                    //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                    setInputVisibilityDeps : function() {
                          var item = this,
                              module = item.module;
                          //Internal item dependencies
                          item.czr_Input.each( function( input ) {
                                switch( input.id ) {
                                      case 'use_custom_bg_color_on_hover' :
                                            _.each( [ 'bg_color_hover' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( input.module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'border-type' :
                                          _.each( [ 'borders' ] , function(_inputId_ ) {
                                                try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                      return 'none' !== input();
                                                }); } catch( er ) {
                                                      api.errare( module.id + ' => error in setInputVisibilityDeps', er );
                                                }
                                          });
                                      break;
                                      case 'use_box_shadow' :
                                            _.each( [ 'push_effect' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( input.module.module_type + ' => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                }
                          });
                    }
              }
      };
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_simple_form_button_child: {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_simple_form_button_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_simple_form_button_child' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_simple_form_fonts_child: {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_simple_form_fonts_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_simple_form_fonts_child' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_simple_form_submission_child: {
                  //mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_simple_form_submission_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_simple_form_submission_child' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      //BUTTON MODULE
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      //EXTEND THE DEFAULT CONSTRUCTORS FOR MONOMODEL
                      module.itemConstructor = api.CZRItem.extend( module.CZRItemConstructor || {} );

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize

              //////////////////////////////////////////////////////////
              /// ITEM CONSTRUCTOR
              //////////////////////////////////////////
              CZRItemConstructor : {
                    //overrides the parent ready
                    ready : function() {
                          var item = this;
                          //wait for the input collection to be populated,
                          //and then set the input visibility dependencies
                          item.inputCollection.bind( function( col ) {
                                if( _.isEmpty( col ) )
                                  return;
                                try { item.setInputVisibilityDeps(); } catch( er ) {
                                      api.errorLog( 'item.setInputVisibilityDeps() : ' + er );
                                }
                          });//item.inputCollection.bind()

                          //fire the parent
                          api.CZRItem.prototype.ready.call( item );
                    },

                    //Fired when the input collection is populated
                    //At this point, the inputs are all ready (input.isReady.state() === 'resolved') and we can use their visible Value ( set to true by default )
                    setInputVisibilityDeps : function() {
                          var item = this,
                              module = item.module;

                          //Internal item dependencies
                          item.czr_Input.each( function( input ) {
                                switch( input.id ) {
                                      case 'use_custom_bg_color_on_hover' :
                                            _.each( [ 'bg_color_hover' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( 'Button module => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'use_box_shadow' :
                                            _.each( [ 'push_effect' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        return input();
                                                  }); } catch( er ) {
                                                        api.errare( 'Button module => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'link-to' :
                                            _.each( [ 'link-pick-url', 'link-custom-url', 'link-target' ] , function( _inputId_ ) {
                                                  try { api.czr_sektions.scheduleVisibilityOfInputId.call( input, _inputId_, function() {
                                                        var bool = false;
                                                        switch( _inputId_ ) {
                                                              case 'link-custom-url' :
                                                                    bool = 'url' == input() && '_custom_' == item.czr_Input('link-pick-url')().id;
                                                              break;
                                                              default :
                                                                    bool = 'url' == input();
                                                              break;
                                                        }
                                                        return bool;
                                                  }); } catch( er ) {
                                                        api.errare( 'Button module => error in setInputVisibilityDeps', er );
                                                  }
                                            });
                                      break;
                                      case 'link-pick-url' :
                                            api.czr_sektions.scheduleVisibilityOfInputId.call( input, 'link-custom-url', function() {
                                                  return '_custom_' == input().id && 'url' == item.czr_Input('link-to')();
                                            });
                                      break;
                                }
                          });
                    }
              }
      };
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_font_child : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_font_child', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_font_child' )
            }
      });
})( wp.customize , jQuery, _ );//global sektionsLocalizedData, serverControlParams
//extends api.CZRDynModule
( function ( api, $, _ ) {
      var Constructor = {
              initialize: function( id, options ) {
                      var module = this;

                      // fixes https://github.com/presscustomizr/nimble-builder/issues/426
                      // 'nimble-set-select-input-options' is triggered in api.czr_sektions.setupSelectInput
                      module.bind('nimble-set-select-input-options', function( filtrable ) {
                            filtrable.params = sektionsLocalizedData.registeredWidgetZones;
                      });

                      // run the parent initialize
                      // Note : must be always invoked always after the input / item class extension
                      // Otherwise the constructor might be extended too early and not taken into account. @see https://github.com/presscustomizr/nimble-builder/issues/37
                      api.CZRDynModule.prototype.initialize.call( module, id, options );

              },//initialize
      };
      //provides a description of each module
      //=> will determine :
      //1) how to initialize the module model. If not crud, then the initial item(s) model shall be provided
      //2) which js template(s) to use : if crud, the module template shall include the add new and pre-item elements.
      //   , if crud, the item shall be removable
      //3) how to render : if multi item, the item content is rendered when user click on edit button.
      //    If not multi item, the single item content is rendered as soon as the item wrapper is rendered.
      //4) some DOM behaviour. For example, a multi item shall be sortable.
      api.czrModuleMap = api.czrModuleMap || {};
      $.extend( api.czrModuleMap, {
            czr_widget_area_module : {
                  mthds : Constructor,
                  crud : false,
                  name : api.czr_sektions.getRegisteredModuleProperty( 'czr_widget_area_module', 'name' ),
                  has_mod_opt : false,
                  ready_on_section_expanded : false,
                  ready_on_control_event : 'sek-accordion-expanded',// triggered in ::scheduleModuleAccordion()
                  defaultItemModel : api.czr_sektions.getDefaultItemModelFromRegisteredModuleData( 'czr_widget_area_module' )
            }
      });
})( wp.customize , jQuery, _ );