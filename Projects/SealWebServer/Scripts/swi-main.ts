﻿/// <reference path="typings/jquery/jquery.d.ts" />
/// <reference path="typings/bootstrap/bootstrap.d.ts" />
/// <reference path="typings/jstree/jstree.d.ts" />
/// <reference path="typings/main.d.ts" />


var $waitDialog: JQuery;
var $editDialog: JQuery;
var $folderTree: JQuery;
var $loginModal: JQuery;
var $outputPanel: JQuery;
var $propertiesPanel: JQuery;
var $elementDropDown: JQuery;

var _gateway: SWIGateway;
var _main: SWIMain;
var _editor: ReportEditorInterface;


declare var folderRightSchedule: number;
declare var folderRightEdit: number;
declare var hasEditor: boolean;

$(document).ready(function () {
    _gateway = new SWIGateway();
    _main = new SWIMain();
    _main.Process();
});

class SWIMain {
    private _connected: boolean = false;
    private _profile: any = null;
    public _folder: any = null;
    private _searchMode: boolean = false;
    private _clipboard: string[];
    private _clipboardCut: boolean = false;
    private _folderpath: string = "\\";

    public Process() {
        $waitDialog = $("#wait-dialog");
        $editDialog = $("#edit-dialog");
        $folderTree = $("#folder-tree");
        $loginModal = $("#login-modal");
        $outputPanel = $("#output-panel");
        $propertiesPanel = $("#properties-panel");
        $elementDropDown = $("#element-dropdown");

        $(".navbar-right").hide();

        $waitDialog.modal();

        $("#search-pattern").keypress(function (e) {
            if ((e.keyCode || e.which) == 13) _main.search();
        });

        $("#password,#username").keypress(function (e) {
            if ((e.keyCode || e.which) == 13) _main.login();
        });

        $("#login-modal-submit").unbind('click').on("click", function (e) {
            _main.login();
        });

        _gateway.GetVersions(
            function (data) {
                $("#brand-id").attr("title", SWIUtil.tr("Web Interface Version") + " : " + data.SWIVersion + "\r\n" + SWIUtil.tr("Server Version") + " : " + data.SRVersion + "\r\n" + data.Info);
                $("#footer-version").text(data.SWIVersion);
            }
        )

        _gateway.GetUserProfile(
            function (data) {
                //User already connected
                _main.loginSuccess(data);
            },
            function (data) {
                //Try to login without authentication
                _gateway.Login("", "", function (data) { _main.loginSuccess(data) }, function (data) { _main.loginFailure(data, true) });
            }
        );

        //General handler
        $(window).on('resize', function () {
            _main.resize();
        });
    }

    private loginSuccess(data: any) {
        _main._connected = true;
        _main._profile = data;
        _main._folder = null;
        _main._searchMode = false;
        _main._clipboard = null;
        _main._clipboardCut = false;
        $("#search-pattern").val("");

        $("body").children(".modal-backdrop").remove();
        $loginModal.modal('hide');
        SWIUtil.HideMessages();
        $(".navbar-right").show();
        $("#footer-div").hide();

        $("#password").val("");
        $("#login-modal-error").text("");

        _main.loadFolderTree();
        $("#main-container").css("display", "block");

        //Refresh
        $("#refresh-nav-item").unbind('click').on("click", function (e) {
            _main.ReloadReportsTable();
            SWIUtil.ShowMessage("alert-success", SWIUtil.tr("The folder has been updated"), 5000);

        });

        //Folders
        $("#folders-nav-item").unbind('click').on("click", function (e) {
            $outputPanel.hide();
            $("#create-folder-name").val("");
            $("#rename-folder-name").val(_main._folder.name);

            SWIUtil.ShowHideControl($("#folder-rename").parent(), _main._folder.manage == 2);
            SWIUtil.ShowHideControl($("#folder-delete").parent(), _main._folder.isEmpty && _main._folder.manage == 2);

            $("#folder-create").unbind('click').on("click", function (e) {
                $("#folder-dialog").modal('hide');
                var newpath = _main._folder.path + (_main._folder.path == "\\" ? "" : "\\") + $("#create-folder-name").val();
                _gateway.CreateFolder(newpath, function (data) {
                    _main._profile.folder = newpath;
                    _main.loadFolderTree();
                    SWIUtil.ShowMessage("alert-success", SWIUtil.tr("The folder has been created"), 5000);
                });
            });

            $("#folder-rename").unbind('click').on("click", function (e) {
                $("#folder-dialog").modal('hide');
                var newpath: string = SWIUtil.GetDirectoryName(_main._folder.path) + "\\" + $("#rename-folder-name").val();
                _gateway.RenameFolder(_main._folder.path, newpath, function (data) {
                    _main._profile.folder = newpath;
                    _main.loadFolderTree();
                    SWIUtil.ShowMessage("alert-success", SWIUtil.tr("The folder has been renamed"), 5000);
                });
            });

            $("#folder-delete").unbind('click').on("click", function (e) {
                $("#folder-dialog").modal('hide');
                _gateway.DeleteFolder(_main._folder.path, function (data) {
                    _main._profile.folder = SWIUtil.GetDirectoryName(_main._folder.path);
                    _main.loadFolderTree();
                    SWIUtil.ShowMessage("alert-success", SWIUtil.tr("The folder has been deleted"), 5000);
                });
            });

            $("#folder-dialog").modal();
        });

        //Search
        $("#search-nav-item").unbind('click').on("click", function (e) {
            $outputPanel.hide();
            _main.search();
        });

        //Profile
        $("#profile-nav-item").unbind('click').on("click", function (e) {
            $outputPanel.hide();
            $("#profile-user").val(_main._profile.name);
            $("#profile-groups").val(_main._profile.group);
            var $select = $("#culture-select");
            if ($select.children("option").length == 0) {
                _gateway.GetCultures(function (data) {
                    for (var i = 0; i < data.length; i++) {
                        $select.append(SWIUtil.GetOption(data[i].id, data[i].val, _main._profile.culture));
                    }
                    $select.selectpicker('refresh');
                });
            }
            else $select.val(_main._profile.culture).change();
            $select.selectpicker('refresh');

            $("#profile-save").unbind('click').on("click", function (e) {
                $("#profile-dialog").modal('hide');
                _gateway.SetUserProfile($("#culture-select").val(), function (data) {
                    location.reload(true);
                });
            });

            $("#profile-dialog").modal();
        });

        //Disconnect
        $("#disconnect-nav-item").unbind('click').on("click", function (e) {
            SWIUtil.HideMessages();
            $outputPanel.hide();
            _gateway.Logout(function (e) {
                _main._connected = false;
                $("#main-container").css("display", "none");
                _main.showLogin();
            });
        });

        //Delete reports
        $("#report-delete-lightbutton").unbind('click').on("click", function (e) {
            if (!SWIUtil.IsEnabled($(this))) return;
            $outputPanel.hide();

            var checked: number = $(".report-checkbox:checked").length;
            $("#message-title").html(SWIUtil.tr("Warning"));
            $("#message-text").html(SWIUtil.tr("Do you really want to delete the reports or files selected ?"));
            $("#message-ok-button").unbind("click").on("click", function (e) {
                $("#message-dialog").modal('hide');
                $waitDialog.modal();
                var paths: string = "";
                $(".report-checkbox:checked").each(function (key, value) {
                    paths += $(value).data("path") + "\n";
                });


                _gateway.DeleteFiles(paths, function (data) {
                    SWIUtil.ShowMessage("alert-success", checked + " " + SWIUtil.tr("report(s) or file(s) have been deleted"), 5000);
                    _main.ReloadReportsTable();
                    $waitDialog.modal('hide');
                });
            });
            $("#message-dialog").modal();
        });

        //Rename
        $("#report-rename-lightbutton").unbind('click').on("click", function (e) {
            if (!SWIUtil.IsEnabled($(this))) return;
            $outputPanel.hide();

            var source: string = $(".report-checkbox:checked").first().data("path");
            if (source) {
                var filename: string = source.split('\\').pop();
                var extension: string = filename.split('.').pop();
                $("#report-name-save").unbind('click').on("click", function (e) {
                    $waitDialog.modal();
                    var folder: string = _main._folder.path;
                    var destination: string = (folder != "\\" ? folder : "") + "\\" + $("#report-name").val() + "." + extension;
                    $("#report-name-dialog").modal('hide');

                    _gateway.MoveFile(source, destination, false, function (data) {
                        _main.ReloadReportsTable();
                        $waitDialog.modal('hide');
                        SWIUtil.ShowMessage("alert-success", SWIUtil.tr("The report or file has been renamed"), 5000);
                    });

                });
                $("#report-name").val(filename.replace(/\.[^/.]+$/, ""));
                $("#report-name-dialog").modal();
            }
        });

        //Copy
        $("#report-copy-lightbutton").unbind('click').on("click", function (e) {
            if (!SWIUtil.IsEnabled($(this))) return;
            $outputPanel.hide();

            _main._clipboard = [];
            $(".report-checkbox:checked").each(function (key, value) {
                _main._clipboard[key] = $(value).data("path");
            });
            _main._clipboardCut = false;
            _main.enableControls();
            SWIUtil.ShowMessage("alert-success", _main._clipboard.length.toString() + " " + SWIUtil.tr("report(s) or files(s) copied in the clipboard"), 5000);
        });

        //Cut
        $("#report-cut-lightbutton").unbind('click').on("click", function (e) {
            if (!SWIUtil.IsEnabled($(this))) return;
            $outputPanel.hide();

            _main._clipboard = [];
            $(".report-checkbox:checked").each(function (key, value) {
                _main._clipboard[key] = $(value).data("path");
            });
            _main._clipboardCut = true;
            _main.enableControls();
            SWIUtil.ShowMessage("alert-success", _main._clipboard.length.toString() + " " + SWIUtil.tr("report(s) or file(s) cut in the clipboard"), 5000);
        });

        //Paste
        $("#report-paste-lightbutton").unbind('click').on("click", function (e) {
            if (!SWIUtil.IsEnabled($(this))) return;
            $outputPanel.hide();

            if (_main._clipboard && _main._clipboard.length > 0) {
                $waitDialog.modal();
                _main._clipboard.forEach(function (value, index) {
                    var newName: string = value.split('\\').pop().split('/').pop();
                    var folder: string = _main._folder.path;
                    var destination: string = (folder != "\\" ? folder : "") + "\\" + newName;
                    _gateway.MoveFile(value, destination, !_main._clipboardCut, function (data) {
                        if (index == _main._clipboard.length - 1) {
                            setTimeout(function () {
                                _main.ReloadReportsTable();
                                $waitDialog.modal('hide');
                                SWIUtil.ShowMessage("alert-success", _main._clipboard.length.toString() + " " + SWIUtil.tr("report(s) or file(s) processed"), 5000);
                            }, 2000);
                        }
                    });
                });
            }
        });

        _main.enableControls();
        _main.resize();
    }

    private search() {
        $waitDialog.modal();
        _gateway.Search(_main._folder.path, $("#search-pattern").val(), function (data) {
            _main._searchMode = true;
            _main.buildReportsTable(data);
            $waitDialog.modal('hide');
        });
    }

    private loginFailure(data: any, firstTry : boolean) {
        $waitDialog.modal('hide');
        _main._connected = false;
        if (!firstTry) $("#login-modal-error").text(data.error);
        _main.showLogin();
        _main.enableControls();
    }

    private showLogin() {
        $("body").children(".modal-backdrop").remove();
        $("#footer-div").show();
        $loginModal.modal();
    }

    private login() {
        $loginModal.modal('hide');
        $waitDialog.modal();
        _gateway.Login($("#username").val(), $("#password").val(),
            function (data) {
                _main.loginSuccess(data);
            },
            function (data) {
                _main.loginFailure(data, false);
            });
    }

    private resize() {
        $("#file-table-view").height($(window).height() - 125);
    }

    private enableControls() {
        var right = 0; //1 Execute,2 Shedule,3 Edit
        var files = false;
        if (_main._folder) {
            right = _main._folder.right;
            files = _main._folder.files;
        }
        $outputPanel.hide();
        SWIUtil.EnableButton($("#report-edit-lightbutton"), right >= folderRightEdit && !files);
        SWIUtil.ShowHideControl($("#report-edit-lightbutton"), hasEditor);
        var checked: number = $(".report-checkbox:checked").length;
        SWIUtil.EnableButton($("#report-rename-lightbutton"), checked == 1 && right >= folderRightEdit);
        SWIUtil.EnableButton($("#report-delete-lightbutton"), checked != 0 && right >= folderRightEdit);
        SWIUtil.EnableButton($("#report-cut-lightbutton"), checked != 0 && right >= folderRightEdit);
        SWIUtil.EnableButton($("#report-copy-lightbutton"), checked != 0 && right > 0);
        SWIUtil.EnableButton($("#report-paste-lightbutton"), (this._clipboard != null && this._clipboard.length > 0) && right >= folderRightEdit);

        SWIUtil.ShowHideControl($("#folders-nav-item"), _main._folder ? _main._folder.manage > 0 : false);

        $("#search-pattern").css("background", _main._searchMode ? "orange" : "white");
    }


    private toJSTreeFolderData(data: any, result: any, parent: string) {
        for (var i = 0; i < data.length; i++) {
            var folder = data[i];
            result[result.length] = { "id": folder.path, "parent": parent, "text": (folder.name == "" ? "Reports" : folder.name), "state": { "opened": folder.expand, "selected": (folder.name == "") } }
            if (folder.folders && folder.folders.length > 0) _main.toJSTreeFolderData(folder.folders, result, folder.path);
        }
        return result;
    }


    private loadFolderTree() {
        _gateway.GetRootFolders(function (data) {
            var result = [];
            $folderTree.jstree("destroy").empty();
            $folderTree.jstree({
                core: {
                    "animation": 0,
                    "themes": { "stripes": true },
                    'data': _main.toJSTreeFolderData(data, result, "#")
                },
                types: {
                    "default": {
                        "icon": "fa fa-folder-o"
                    }
                },

                plugins: ["types", "wholerow"]

            });

            $folderTree.on("changed.jstree", function (e, data) {
                _main.ReloadReportsTable();
            });


            setTimeout(function () {
                if (!_main._profile.folder || _main._profile.folder == "" || !$folderTree.jstree(true).get_node(_main._profile.folder)) _main._profile.folder = "\\";
                _main._folderpath = _main._profile.folder;
                $folderTree.jstree("deselect_all");
                $folderTree.jstree('select_node', _main._folderpath);
            }, 100);

            $waitDialog.modal('hide');
        });
    }

    public ReloadReportsTable() {
        _main.LoadReports($folderTree.jstree("get_selected")[0]);
    }

    public LoadReports(path: string) {
        if (!path) return;

        _gateway.GetFolderDetail(path, function (data) {
            _main._searchMode = false;
            _main._folder = data.folder;
            _main._folder.isEmpty = (data.files.length == 0 && $folderTree.jstree("get_selected", true)[0].children.length == 0);
            _main.buildReportsTable(data);
            _main._profile.folder = path;
        });
    }

    private buildReportsTable(data: any) {
        $('#file-table').dataTable().fnDestroy();

        var $tableBody = $("#file-table-body");
        $tableBody.empty();
        for (var i = 0; i < data.files.length; i++) {
            var $tr = $("<tr>");
            var file = data.files[i];
            $tableBody.append($tr);
            $tr.append($("<td>").append($("<input>").addClass("report-checkbox").prop("type", "checkbox").data("path", file.path)));
            $tr.append($("<td>").append($("<a>").addClass("report-name").data("path", file.path).data("isReport", file.isReport).text(file.name)));
            var $td = $("<td>").css("text-align", "center").data("path", file.path);
            $tr.append($td);
            if (file.isReport) {
                $td.append($("<button>").prop("type", "button").prop("title", SWIUtil.tr("Views and outputs")).addClass("btn btn-default btn-table fa fa-list-ul report-output"));
                if (file.right >= folderRightSchedule && hasEditor) $td.append($("<button>").prop("type", "button").prop("title", SWIUtil.tr("Edit report")).addClass("btn btn-default fa fa-pencil report-edit"));
            }
            $tr.append($("<td>").css("text-align", "right").text(file.last));
        }

        var $cb = $("#selectall-checkbox");
        $cb.prop("checked", false);
        $("#selectall-checkbox").unbind("click").bind("click", function () {
            $(".report-checkbox").each(function (key, value) {
                var isChecked = $cb.is(':checked');
                $(value).prop("checked", isChecked);
            });
            _main.enableControls();
        });

        $(".report-name").on("click", function (e) {
            $outputPanel.hide();
            if ($(e.currentTarget).data("isReport")) _gateway.ExecuteReport($(e.currentTarget).data("path"), false, null, null);
            else _gateway.ViewFile($(e.currentTarget).data("path"));
        });

        $(".report-output").on("click", function (e) {
            $outputPanel.hide();
            var $target = $(e.currentTarget);
            var $tableBody = $("#output-table-body");
            $tableBody.empty();
            $tableBody.append($("<tr>").append($("<td colspan=2>").append($("<i>").addClass("fa fa-spinner fa-spin fa-1x fa-fw")).append($("<span>").text(SWIUtil.tr("Please wait") + "..."))));
            $outputPanel.css({
                'display': 'inline',
                'position': 'absolute',
                'z-index': '10000',
                'left': $target.offset().left - 120,
                'top': $target.offset().top + $target.height() + 10
            }).show();

            $("#output-panel-close").on("click", function () {
                $outputPanel.hide();
            });

            _gateway.GetReportDetail($target.parent().data("path"),
                function (data) {
                    $tableBody.empty();
                    for (var i = 0; i < data.views.length; i++) {
                        var $tr = $("<tr>");
                        $tableBody.append($tr);
                        $tr.append($("<td>").append($("<a>").data("viewguid", data.views[i].guid).addClass("output-name").text(data.views[i].displayName)));
                        $tr.append($("<td>").html(SWIUtil.tr("View")));
                    }
                    for (var i = 0; i < data.outputs.length; i++) {
                        var $tr = $("<tr>");
                        $tableBody.append($tr);
                        $tr.append($("<td>").append($("<a>").data("outputguid", data.outputs[i].guid).addClass("output-name").text(data.outputs[i].displayName)));
                        $tr.append($("<td>").html(SWIUtil.tr("Output")));
                    }

                    $(".output-name").on("click", function (e) {
                        $outputPanel.hide();
                        _gateway.ExecuteReport($target.parent().data("path"), false, $(e.currentTarget).data("viewguid"), $(e.currentTarget).data("outputguid"));
                    });
                },
                function (data) {
                    SWIUtil.ShowMessage("alert-danger", data.error, 0);
                    $outputPanel.hide();
                }
            )
        });

        if (_editor) _editor.init();

        $('#file-table').dataTable({
            sDom: '<"dataTableTop"lfpir>t',
            bSort: true,
            stateSave: true,
            aaSorting: [],
            bPaginate: true,
            sPaginationType: "full_numbers",
            iDisplayLength: 25,
            bInfo: true,
            bFilter: true,
            bAutoWidth: false,
            oLanguage: {
                oPaginate: {
                    sFirst: "|&lt;",
                    sPrevious: "&lt;&lt;",
                    sNext: ">>",
                    sLast: ">|"
                },
                sSearch: SWIUtil.tr("Filter") + " ",
                sZeroRecords: SWIUtil.tr("No report"),
                sLengthMenu: SWIUtil.tr("Show _MENU_ reports"),
                sInfo: SWIUtil.tr("Showing _START_ to _END_ of _TOTAL_"),
                sInfoEmpty: SWIUtil.tr("Showing 0 to 0 of 0"),
                sInfoFiltered: SWIUtil.tr("(filtered from _MAX_)"),
                sInfoPostFix: "",
            },
            aoColumnDefs: [{ "bSortable": false, "aTargets": [0, 2] }]
        });

        //check box handler
        $(".report-checkbox").on("click", function () {
            _main.enableControls();
        });

        _main.enableControls();
    }
}
