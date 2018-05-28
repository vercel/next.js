import * as React from 'react';

import * as T from './types';

interface DetailProps {
    car : T.Car;
}

const Detail : React.SFC < DetailProps > = ({car} : DetailProps) => {
    return (
        <div className="CarDetail">
            <h1>{`${car.make} ${car.model}`}</h1>
            <p>Engine : {car.engine}</p>
            <p>Year : {car.year}</p>
            <p>Mileage : {car.mileage}</p>
            <p>Equipment :
            </p>
            <ul>{car.equipment && car
                    .equipment
                    .map((e : string, index : number) => <li key={index}>{e}</li>)}</ul>
        </div>
    );
};

export default Detail;