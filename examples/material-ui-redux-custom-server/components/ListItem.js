import React from 'react'

// material ui
import { Card, CardActions, CardHeader, CardMedia, CardTitle, CardText } from 'material-ui/Card'
import FlatButton from 'material-ui/FlatButton'

function ListItem (props) {
  const { dataSource } = props
  return (
    <div style={{ margin: '0 auto' }}>
      {dataSource.map(item => (
        <Card key={item.url} className='cardItem'>
          <CardHeader
            title={item.author}
            subtitle={item.publishedDate}
          />

          <CardMedia overlay={<CardTitle title={item.title} subtitle={item.author} />}>
            {item.urlToImage && <img src={item.urlToImage} role='presentation' />}
          </CardMedia>

          <CardTitle title={item.title} subtitle={item.publishedDate} />

          <CardText>{item.description}</CardText>

          <CardActions>
            <a href={item.url} target='blank'>
              <FlatButton primary label='Detail' />
            </a>
          </CardActions>
        </Card>
      ))}
    </div>
  )
}

export default ListItem
