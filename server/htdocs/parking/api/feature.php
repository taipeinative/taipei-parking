<?php
// require_once '../backend/get_poi.php';

// =========
// CONSTANTS
// =========

/**
 * The Python executable location.
 * @var string
 */
const PYTHON = 'D:\Documents\PythonVenv\geo\Scripts\python.exe';

// =========
// REQUESTS
// =========
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $feature = $_POST['feature'] ?? null;

    if (is_null($feature)) {
        http_response_code(400);
        echo json_encode(["error" => "The feature type is not specified."]);
        exit;
    }

    // if (is_null($xmin) || is_null($ymin) || is_null($xmax) || is_null($ymax)) {
    //     http_response_code(400);
    //     echo json_encode(["error" => "Missing parameters (xmin, ymin, xmax, ymax)."]);
    //     exit;
    // }

    switch ($feature) {
        case 'grid':
            echo file_get_contents('..' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'grid.geojson');
            break;

        case 'lot-centroid':
            echo file_get_contents('..' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'lot-centroid.geojson');
            break;

        case 'lot-polygon':
            echo file_get_contents('..' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'lot.geojson');
            break;

        case 'poi':
            echo file_get_contents('..' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'poi.geojson');
            break;
        
        default:
            http_response_code(400);
            echo json_encode(["error" => "Invalid feature type."]);
            break;
    }

} else {
    http_response_code(405);
    echo json_encode(["error" => "Use POST method."]);
}
