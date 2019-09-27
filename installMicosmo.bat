rem Manually install the mitoolbox micosmo packages to the node_modules
rem Assumes that mitoolbox project directory is in the same location as target project directory
xcopy /q /s /e /i /d /y ..\mitoolbox\aframe node_modules\@micosmo\aframe
xcopy /q /s /e /i /d /y ..\mitoolbox\core node_modules\@micosmo\core
xcopy /q /s /e /i /d /y ..\mitoolbox\ticker node_modules\@micosmo\ticker
xcopy /q /s /e /i /d /y ..\mitoolbox\async node_modules\@micosmo\async
