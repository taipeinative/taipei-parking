<?php
// Handle POST requests
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $feature = $_POST['feature'] ?? null;

    if (is_null($feature)) {
        http_response_code(400);
        echo json_encode(["error" => "The feature type is not specified."]);
        exit;
    }

    switch ($feature) {
        case 'grid':
            header('Content-Type: application/geo+json');
            echo file_get_contents('..' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'grid.geojson');
            break;

        case 'lot':
            header('Content-Type: application/geo+json');
            echo file_get_contents('..' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'lot.geojson');
            break;

        case 'poi':
            header('Content-Type: application/geo+json');
            echo file_get_contents('..' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'poi.geojson');
            break;
        
        default:
            header('Content-Type: application/json');
            http_response_code(400);
            echo json_encode(["error" => "Invalid feature type."]);
            break;
    }

} else {
    http_response_code(405);
    echo json_encode(["error" => "Use POST method."]);
}
